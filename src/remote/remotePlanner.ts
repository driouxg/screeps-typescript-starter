import * as creepRoles from "creeps/roles"
import { isHostile } from "config/relations"
import { myUsername } from "utils/username"
import { isHostileRoom } from "utils/roomSafety"
import {
  builtShare,
  placeRoadSites,
  planRoute,
  ROAD_MIN_RCL,
  ROADS_BUILT_SHARE,
  Route,
  routeKeys,
  roundTrip,
  setHighway,
  surveyHighways
} from "./highway"
import { bodyCost, haulerCostPerCarry, maintainerBody, minerBody } from "./remoteBodies"

/**
 * Goal: Mine sources in nearby rooms when they're worth it, without starving the home room's spawn, and stop when
 * they're not safe.
 *
 * Every PLAN_INTERVAL ticks, for each owned room from MIN_RCL: every source in a room within reach (adjacent rooms at
 * RCL 3, two rooms away from RCL 4, by a route that avoids hostile rooms) is scored by its net energy per tick, with
 * the bodies the room can actually build (see remoteBodies):
 *
 *   income     5/tick, or 10/tick once the room can afford a reserver (a reserved controller doubles the source)
 *   miner      its body every 1500 ticks
 *   haulers    CARRY to move `income` over a round trip, with the MOVE they need: half as many once the highway's
 *              roads are built, which also makes the trip shorter (no swamp slowdown)
 *   container  built once by the miner (amortized over AMORTIZE_TICKS) and repaired, as containers outside our rooms
 *              decay fast; no haulers go before it's built (see RemoteSpawnHandler)
 *   roads      from ROAD_MIN_RCL: built once (amortized) and kept up, plus the highway maintainer's body now and then;
 *              only the road a source adds counts, as routes share roads (see remote/highway)
 *   reserver   2 CLAIM + 2 MOVE every 600 ticks, shared by the room's sources
 *
 * Sources are chosen best first while they net at least MIN_NET and fit the spawn:
 *   - spawn time: what their creeps take (3 ticks per body part per lifetime) must fit in what the home's own creeps
 *     leave, less SPAWN_HEADROOM (spawnBudget);
 *   - spawn queue: the share of time the spawns were actually busy is measured (trackSpawnUse). Above BUSY_LIMIT no
 *     new remotes are taken on (only those already mined are kept), and above OVERLOADED the worst one is dropped,
 *     however good the estimate looked: home creeps (replacements, defenders) must not wait behind remote ones.
 *
 * Rooms owned or reserved by anyone else (allies included), source keeper rooms and rooms with an invader core are
 * never mined. A room where hostile fighters show up is paused for PAUSE_TICKS: its creeps go home.
 */

export const MIN_RCL = 3
/** Rooms away we mine: adjacent ones at RCL 3, further from RCL 4. */
function maxRoute(level: number): number {
  return level < 4 ? 1 : 2
}
const PLAN_INTERVAL = 500
/** Highway health is surveyed and road sites placed this often. */
const SITE_INTERVAL = 100
const MIN_NET = 1
/** Keep this share of spawn time free, for replacements, defenders and spikes in demand. */
const SPAWN_HEADROOM = 0.1
/** Measured spawn use above which no new remotes are taken on... */
const BUSY_LIMIT = 0.85
/** ...and above which the worst one is dropped. */
const OVERLOADED = 0.95
/** Spawn use is averaged over about this many ticks. */
const SPAWN_USE_TICKS = 300
const PAUSE_TICKS = 1500
/** One-off building (containers, roads) is spread over this many ticks when weighing a source. */
const AMORTIZE_TICKS = 20000
/** Ticks per hauler round trip beyond walking: withdrawing, delivering, passing other creeps. */
const TRIP_OVERHEAD = 10
/** Hauling capacity beyond the exact need, so energy doesn't pile up and decay at the source. */
const HAULER_MARGIN = 1.1
/** The highway maintainer is needed about this often (roads lose half their hits in ~25000 ticks; new sites sooner). */
const MAINTAINER_EVERY = 5000
const RESERVER_BODY: BodyPartConstant[] = [CLAIM, CLAIM, MOVE, MOVE]
const RESERVER_COST = bodyCost(RESERVER_BODY)
/** A container outside our rooms loses CONTAINER_DECAY hits every CONTAINER_DECAY_TIME ticks. */
const CONTAINER_UPKEEP = (CONTAINER_DECAY * REPAIR_COST) / CONTAINER_DECAY_TIME

export interface RemoteSource {
  id: string
  room: string
  x: number
  y: number
  home: string
  /** Where the miner stands, next to the source; its container goes here. */
  spot: { x: number; y: number }
  /** Path length from home to the spot. */
  distance: number
  /** Ticks for a hauler to walk from home to the spot. */
  travel: number
  reserve: boolean
  /** Whether its route gets a road (see score). */
  road: boolean
  /** Whether haulers are built for roads (2 CARRY per MOVE): it gets a road and the highway is mostly built. */
  roads: boolean
  workParts: number
  /** CARRY parts the source's haulers need in all. */
  carryParts: number
  net: number
  /** Share of one spawn's time its creeps take. */
  spawnLoad: number
}

declare global {
  interface Memory {
    remotes?: { [sourceId: string]: RemoteSource }
    /** The last plan's candidates and why each was or wasn't chosen, for checking from the console. */
    remoteReport?: string[]
    /** Remote rooms paused (hostiles seen) until the given tick. */
    remotePaused?: { [roomName: string]: number }
  }
  interface RoomMemory {
    /** Share of the time the room's spawns were busy, averaged over about SPAWN_USE_TICKS (see RemotePlanner). */
    spawnUse?: number
  }
}

interface Candidate {
  source: { id: string; x: number; y: number }
  room: string
  route: Route
}

export default class RemotePlanner {
  private report: string[] = []

  public run(): void {
    this.trackSpawnUse()
    this.watchForThreats()

    const homes = Object.values(Game.rooms).filter(r => r.controller?.my && MIN_RCL <= r.controller.level)
    if (Game.time % SITE_INTERVAL === 0) {
      surveyHighways()
      for (const home of homes) placeRoadSites(home)
    }

    // Plan now if never planned, or if remotes in memory come from older code (no miner spot).
    const stale = !Memory.remotes || Object.values(Memory.remotes).some(r => !r.spot)
    if (Game.time % PLAN_INTERVAL !== 0 && !stale) return

    const remotes: { [id: string]: RemoteSource } = {}
    this.report = []
    for (const home of homes) {
      const origin = home.storage?.pos ?? home.find(FIND_MY_SPAWNS)[0]?.pos
      if (!origin) continue
      for (const source of this.choose(home, origin)) remotes[source.id] = source
    }
    // Homes no longer mining remotes (or below MIN_RCL) don't keep a highway.
    for (const home of Object.keys(Memory.highways ?? {}))
      if (!Object.values(remotes).some(r => r.home === home)) delete Memory.highways![home]
    Memory.remotes = remotes
    Memory.remoteReport = this.report
  }

  /** Average share of each owned room's spawns that are busy. */
  private trackSpawnUse(): void {
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller?.my) continue
      const spawns = room.find(FIND_MY_SPAWNS)
      if (spawns.length <= 0) continue
      const busy = spawns.filter(s => s.spawning).length / spawns.length
      const previous = room.memory.spawnUse ?? busy
      room.memory.spawnUse = previous + (busy - previous) / SPAWN_USE_TICKS
    }
  }

  /** Remote rooms we can see with hostile fighters or an invader core get paused. */
  private watchForThreats(): void {
    const paused = (Memory.remotePaused = Memory.remotePaused ?? {})
    for (const name in paused) if (paused[name] <= Game.time) delete paused[name]

    const rooms = new Set(Object.values(Memory.remotes ?? {}).map(r => r.room))
    for (const name of rooms) {
      const room = Game.rooms[name]
      if (!room) continue
      const fighters = room.find(FIND_HOSTILE_CREEPS, {
        filter: c => isHostile(c) && (0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK))
      })
      const core = room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_INVADER_CORE })
      if (fighters.length || core.length) {
        if (!paused[name]) console.log(`Remote ${name}: hostiles, pausing for ${PAUSE_TICKS} ticks`)
        paused[name] = Game.time + PAUSE_TICKS
      }
    }
  }

  private choose(home: Room, origin: RoomPosition): RemoteSource[] {
    const level = home.controller!.level
    const reach = maxRoute(level)
    const roadsOn = ROAD_MIN_RCL <= level
    const roads = roadsOn && ROADS_BUILT_SHARE <= builtShare(home.name)
    const capacity = home.energyCapacityAvailable
    const canReserve = RESERVER_COST <= capacity
    // The room mined is at most `reach` rooms away, but the path there may detour through others (walls between rooms).
    const maxRooms = 2 * reach + 3

    // Every candidate, scored on its own route (as if it paid for all of its road).
    const candidates: (Candidate & { score: RemoteSource })[] = []
    for (const [roomName] of this.roomsInReach(home.name, reach)) {
      const why = this.whyNotMineable(roomName)
      if (why) {
        this.report.push(`${home.name} -> ${roomName}: skipped, ${why}`)
        continue
      }
      for (const s of Memory.rooms[roomName].intel!.sourcePositions ?? []) {
        const route = planRoute(origin, new RoomPosition(s.x, s.y, roomName), new Set(), maxRooms)
        if (!route) {
          this.report.push(`${home.name} -> ${roomName} source ${s.x},${s.y}: no safe path`)
          continue
        }
        const c = { source: s, room: roomName, route }
        candidates.push({ ...c, score: score(c, home.name, capacity, canReserve, roadsOn, roads, route.roadCost) })
      }
    }
    // Spawn time is what limits how many sources a room can mine: best net energy per share of spawn time first.
    const density = (s: RemoteSource) => s.net / Math.max(0.001, s.spawnLoad)
    candidates.sort((a, b) => density(b.score) - density(a.score))

    // Spawn queue: when the spawns are already this busy, keep only what's mined now (dropping the worst if overloaded).
    const spawnUse = home.memory.spawnUse ?? 0
    const current = Object.values(Memory.remotes ?? {})
      .filter(r => r.home === home.name)
      .sort((a, b) => b.net - a.net)
    const allowed =
      spawnUse <= BUSY_LIMIT ? null : new Set((OVERLOADED < spawnUse ? current.slice(0, -1) : current).map(r => r.id))
    if (allowed) this.report.push(`${home.name}: spawns ${Math.round(spawnUse * 100)}% busy, no new remotes`)

    // Best first, each re-planned onto the roads already chosen, so it's charged only for the road it adds.
    const budget = spawnBudget(home)
    let spawnLoad = 0
    const chosen: RemoteSource[] = []
    const shared = new Set<string>()
    const highway: RoomPosition[] = []
    const reservedRooms = new Set<string>()
    for (const c of candidates) {
      const route =
        (shared.size ? planRoute(origin, new RoomPosition(c.source.x, c.source.y, c.room), shared, maxRooms) : null) ??
        c.route
      const newRoad = route.tiles
        .filter(t => !shared.has(`${t.roomName}:${t.x * 50 + t.y}`))
        .reduce((sum, t) => sum + roadBuildCost(t), 0)
      const s = score({ ...c, route }, home.name, capacity, canReserve, roadsOn, roads, newRoad)

      const reserverShare = s.reserve && !reservedRooms.has(c.room) ? RESERVER_COST / CREEP_CLAIM_LIFE_TIME : 0
      const reserverLoad = reserverShare ? (RESERVER_BODY.length * CREEP_SPAWN_TIME) / CREEP_CLAIM_LIFE_TIME : 0
      const maintainer = s.road && !chosen.some(x => x.road) ? maintainerBody(capacity) : []
      const maintainerShare = bodyCost(maintainer) / MAINTAINER_EVERY
      const maintainerLoad = (maintainer.length * CREEP_SPAWN_TIME) / MAINTAINER_EVERY
      const net = s.net - reserverShare - maintainerShare
      const load = s.spawnLoad + reserverLoad + maintainerLoad

      const verdict =
        net < MIN_NET
          ? "not worth it"
          : allowed && !allowed.has(s.id)
          ? "spawn queue too busy"
          : budget < spawnLoad + load
          ? "over the spawn budget"
          : "chosen"
      this.report.push(
        `${home.name} -> ${c.room} source ${c.source.x},${c.source.y}: distance ${s.distance}, ` +
          `${s.workParts} WORK + ${s.carryParts} CARRY, ${s.road ? "road" : "no road"}, net ${net.toFixed(1)}/tick, ` +
          `spawn ${Math.round(load * 100)}%, ${verdict}`
      )
      if (verdict !== "chosen") continue
      spawnLoad += load
      if (s.reserve) reservedRooms.add(c.room)
      chosen.push({ ...s, net: +net.toFixed(2), spawnLoad: +load.toFixed(3) })
      if (!s.road) continue
      for (const k of routeKeys(route)) shared.add(k)
      highway.push(...route.tiles)
    }

    if (0 < highway.length) setHighway(home.name, highway)
    else if (Memory.highways) delete Memory.highways[home.name]
    return chosen
  }

  /** Rooms within `range` of home (with their distance in rooms) by a route that avoids hostile rooms. */
  private roomsInReach(home: string, range: number): [string, number][] {
    const found: [string, number][] = []
    let frontier = [home]
    const seen = new Set(frontier)
    for (let d = 1; d <= range; d++) {
      const next: string[] = []
      for (const room of frontier)
        for (const name of Object.values(Game.map.describeExits(room) ?? {})) {
          if (!name || seen.has(name)) continue
          seen.add(name)
          if (isHostileRoom(name)) continue
          next.push(name)
          found.push([name, d])
        }
      frontier = next
    }
    return found
  }

  /**
   * Why a room can't be mined, or null if it can: it must be scouted, have sources and a controller, and nobody else
   * (allies included) may own or reserve it.
   */
  private whyNotMineable(roomName: string): string | null {
    const intel = Memory.rooms[roomName]?.intel
    if (!intel) return "not scouted yet"
    if (!intel.controller || !intel.sourcePositions?.length) return "no controller or sources"
    if (0 < (intel.keeperLairs ?? 0)) return "source keepers"
    if (intel.controller.owner) return `owned by ${intel.controller.owner}`
    if (0 < intel.hostileStructures) return "hostile structures"
    if (intel.controller.reservedBy && intel.controller.reservedBy !== myUsername())
      return `reserved by ${intel.controller.reservedBy}`
    if (Memory.remotePaused?.[roomName]) return "paused for hostiles"
    return null
  }
}

function roadBuildCost(pos: RoomPosition): number {
  const swamp = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
  return CONSTRUCTION_COST[STRUCTURE_ROAD] * (swamp ? CONSTRUCTION_COST_ROAD_SWAMP_RATIO : 1)
}

/**
 * Net energy per tick of mining a source, and the share of a spawn's time its miner and haulers take.
 *
 * From ROAD_MIN_RCL it's weighed both ways, and the source gets a road (a highway, see remote/highway) only if that
 * nets more: a road halves the haulers' MOVE parts and keeps them at a tile per tick, but it costs 300 energy a tile,
 * 1500 on swamp, and a long swampy route may never pay that back. `newRoad` is the energy to build the part of its
 * road not already on the highway (routes share roads); building is spread over AMORTIZE_TICKS.
 *
 * Haulers are spawned for the roads there are now (`roadsBuilt`), so while a road is being built they need more
 * CARRY and MOVE; spawn time is counted for whichever needs more, so the spawn isn't overbooked meanwhile.
 */
function score(
  c: Candidate,
  home: string,
  capacity: number,
  reserve: boolean,
  roadsOn: boolean,
  roadsBuilt: boolean,
  newRoad: number
): RemoteSource {
  const income = (reserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME
  const miner = minerBody(capacity, income)
  const carryFor = (withRoads: boolean) =>
    Math.ceil((income * (roundTrip(c.route, withRoads) + TRIP_OVERHEAD) * HAULER_MARGIN) / CARRY_CAPACITY)
  const container = CONTAINER_UPKEEP + CONSTRUCTION_COST[STRUCTURE_CONTAINER] / AMORTIZE_TICKS

  const option = (withRoad: boolean) => {
    const carry = carryFor(withRoad)
    const perCarry = haulerCostPerCarry(withRoad)
    const creeps = (bodyCost(miner) + carry * perCarry.energy) / CREEP_LIFE_TIME
    const road = withRoad ? newRoad / AMORTIZE_TICKS + c.route.roadUpkeep : 0
    return { net: income - creeps - container - road, haulerParts: carry * perCarry.parts }
  }
  const without = option(false)
  const withRoad = roadsOn ? option(true) : null
  const road = withRoad !== null && without.net < withRoad.net
  const chosen = road ? withRoad! : without

  const roads = road && roadsBuilt
  const carryParts = carryFor(roads)
  const haulerParts = Math.max(carryParts * haulerCostPerCarry(roads).parts, chosen.haulerParts)
  const spawnLoad = ((miner.length + haulerParts) * CREEP_SPAWN_TIME) / CREEP_LIFE_TIME

  return {
    id: c.source.id,
    room: c.room,
    x: c.source.x,
    y: c.source.y,
    home,
    spot: { x: c.route.spot.x, y: c.route.spot.y },
    distance: c.route.length,
    travel: Math.ceil(roundTrip(c.route, roads) / 2),
    reserve,
    road,
    roads,
    workParts: miner.filter(p => p === WORK).length,
    carryParts,
    net: chosen.net,
    spawnLoad
  }
}

/**
 * Spawn time (in spawns' worth) left for remote mining: the room's spawns, less headroom, less what the room's own
 * creeps take to keep replacing (body parts * CREEP_SPAWN_TIME per lifetime).
 */
function spawnBudget(home: Room): number {
  const spawns = home.find(FIND_MY_SPAWNS).length
  const remoteRoles = [
    creepRoles.REMOTE_MINER,
    creepRoles.REMOTE_HAULER,
    creepRoles.RESERVER,
    creepRoles.HIGHWAY_MAINTAINER
  ]
  const homeLoad = Object.values(Game.creeps)
    .filter(c => c.memory.room === home.name && !remoteRoles.includes(c.memory.role))
    .reduce((sum, c) => {
      const life = c.body.some(p => p.type === CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
      return sum + (c.body.length * CREEP_SPAWN_TIME) / life
    }, 0)
  return spawns * (1 - SPAWN_HEADROOM) - homeLoad
}
