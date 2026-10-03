import * as creepRoles from "creeps/roles"
import { isHostile } from "config/relations"
import { considerContest, runContests } from "./contest"
import { RESERVER_BODY, RESERVER_COST, reservingBase } from "./reserving"
import { myUsername } from "utils/username"
import { isHostileRoom } from "utils/roomSafety"
import { controls } from "config/controls"
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
import { assessRemoteThreat, forgetStaleThreats } from "defence/remoteDefence"

/**
 * Goal: Mine sources in nearby rooms when they're worth it, without starving the home room's spawn, and stop when
 * they're not safe.
 *
 * Every PLAN_INTERVAL ticks, for each owned room from MIN_RCL: every source in a room within reach (adjacent rooms at
 * RCL 3, two rooms away from RCL 4, by a route that avoids hostile rooms) is scored by its net energy per tick, with
 * the bodies the room can actually build (see remoteBodies):
 *
 *   income     5/tick, or 10/tick once the room, or a base nearby, can afford a reserver (a reserved controller doubles
 *              the source; see remote/reserving)
 *   miner      its body every 1500 ticks
 *   haulers    CARRY to move `income` over a round trip, with 1 MOVE per 2 CARRY: full, they're twice as fast once
 *              the highway's roads are built (five times on swamp), so far fewer are needed
 *   container  built once by the miner (amortized over AMORTIZE_TICKS) and repaired, as containers outside our rooms
 *              decay fast; no haulers go before it's built (see RemoteSpawnHandler)
 *   roads      from ROAD_MIN_RCL: built once (amortized over ROAD_AMORTIZE_TICKS) and kept up, plus the highway maintainer's body now and then;
 *              only the road a source adds counts, as routes share roads (see remote/highway). Every source mined in
 *              a room the highway reaches gets its branch, worth it or not on its own (see connectRoom): haulers of a
 *              room's second source were left walking the last stretch off-road at half speed or worse
 *   reserver   2 CLAIM + 2 MOVE every 600 ticks, shared by the room's sources (counted against this home even when a
 *              stronger base nearby spawns it)
 *
 * Sources are chosen best first while they net at least MIN_NET and fit the spawn:
 *   - spawn time: what their creeps take (3 ticks per body part per lifetime) must fit in what the home's own creeps
 *     leave, less SPAWN_HEADROOM (spawnBudget);
 *   - spawn queue: the share of time the spawns were actually busy is measured (trackSpawnUse). Above BUSY_LIMIT no
 *     new remotes are taken on (only those already mined are kept), and above OVERLOADED the worst one is dropped,
 *     however good the estimate looked: home creeps (replacements, defenders) must not wait behind remote ones.
 *
 * Each remote room belongs to one base only (assignRooms): several bases mining one room got in each other's way,
 * and two picking the same source left one of them spawning creeps for a source the other had. Of the bases that can
 * reach a room, it's the one mining it now (so its creeps and roads aren't thrown away), else the nearest, the bigger
 * on ties. A base plans only from its own rooms; a mineable room its owner passes on (spawn budget, not worth it from
 * there) is then offered to the other bases in reach, biggest first (see run), so it isn't left unmined for being
 * nearest the wrong base.
 *
 * Rooms owned or reserved by anyone else (allies included), source keeper rooms and rooms with an invader core are
 * never mined: the game doesn't let us harvest in a room whose controller someone else owns or reserves (a base we
 * razed too, see remote/razed, until its controller is free). Where hostiles show up (see watchForThreats), defenders are sent if they can win; if they can't, the
 * room is paused for PAUSE_TICKS and its creeps go home.
 */

export const MIN_RCL = 3
/** The furthest (in rooms) we ever mine. */
export const MAX_REMOTE_ROUTE = 2
/** Rooms away we mine: adjacent ones at RCL 3, further from RCL 4. */
function maxRoute(level: number): number {
  return level < 4 ? 1 : MAX_REMOTE_ROUTE
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
/** While defenders deal with a room, its remote creeps stay out until this long after it's clear. */
const DEFENDED_PAUSE_TICKS = 10
/** Creeps that work outside the home room for remote mining: rooms they're in are watched for hostiles. */
const REMOTE_ROLES = [
  creepRoles.REMOTE_MINER,
  creepRoles.REMOTE_HAULER,
  creepRoles.RESERVER,
  creepRoles.HIGHWAY_MAINTAINER,
  creepRoles.REMOTE_DEFENDER
]
/** One-off building (containers, roads) is spread over this many ticks when weighing a source. */
const AMORTIZE_TICKS = 20000
/** Roads last as long as they're kept up (their upkeep is counted separately), so building one is spread over longer. */
const ROAD_AMORTIZE_TICKS = 100000
/**
 * Energy per tick a whole spawn's time is worth when weighing a road: spawn time, not energy, limits how many remotes a
 * home can run, and remotes net roughly this per spawn's worth of their creeps. A road makes full haulers twice as
 * fast (see roundTrip), so it takes fewer of them, and less of the spawn's time.
 */
const SPAWN_TIME_VALUE = 15
/** Ticks per hauler round trip beyond walking: withdrawing, delivering, passing other creeps. */
const TRIP_OVERHEAD = 10
/** Hauling capacity beyond the exact need, so energy doesn't pile up and decay at the source. */
const HAULER_MARGIN = 1.1
/** The highway maintainer is needed about this often (roads lose half their hits in ~25000 ticks; new sites sooner). */
const MAINTAINER_EVERY = 5000
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
  /** Whether haulers travel at road speed (see roundTrip): it gets a road and the highway is mostly built. */
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

/** A base's remote plan (see RemotePlanner.choose). */
interface Plan {
  chosen: RemoteSource[]
  /** Rooms it weighed sources in: mineable, with a safe path. */
  considered: Set<string>
  /** Its highway's road tiles. */
  highway: RoomPosition[]
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
    runContests()

    // Remote mining switched off (see config/controls): drop every remote now, so its creeps go home.
    if (!controls().remoteMining) {
      if (Object.keys(Memory.remotes ?? {}).length) console.log("Remote mining switched off")
      Memory.remotes = {}
      return
    }
    const homes = Object.values(Game.rooms).filter(r => r.controller?.my && MIN_RCL <= r.controller.level)
    if (Game.time % SITE_INTERVAL === 0) {
      surveyHighways()
      for (const home of homes) placeRoadSites(home)
    }

    // Plan now if never planned, or if remotes in memory come from older code (no miner spot).
    // Or straight away when a contest was won (see remote/contest), so the room is mined before they take it back.
    const stale = !Memory.remotes || Object.values(Memory.remotes).some(r => !r.spot) || !!Memory.remotesReplan
    if (Game.time % PLAN_INTERVAL !== 0 && !stale) return
    delete Memory.remotesReplan
    // Listed afresh by this plan (see considerContest).
    Memory.contestCandidates = {}

    this.report = []
    const origins = new Map<string, RoomPosition>()
    for (const home of homes) {
      const origin = home.storage?.pos ?? home.find(FIND_MY_SPAWNS)[0]?.pos
      if (origin) origins.set(home.name, origin)
    }
    const planners = homes.filter(h => origins.has(h.name))
    const owners = this.assignRooms(planners)
    const own = (home: Room) => new Set([...owners].filter(([, owner]) => owner === home.name).map(([room]) => room))

    // Each base plans from its own rooms.
    const plans = new Map<string, Plan>()
    for (const home of planners) plans.set(home.name, this.choose(home, origins.get(home.name)!, own(home)))

    // Mineable rooms their owner passed on go to another base in reach that wants them, biggest first. A base that
    // takes one re-plans with it added, so the room is weighed against its own.
    const minedRooms = () => {
      const mined = new Set<string>()
      for (const plan of plans.values()) for (const r of plan.chosen) mined.add(r.room)
      return mined
    }
    const passed = new Set<string>()
    for (const plan of plans.values())
      for (const room of plan.considered) if (!plan.chosen.some(r => r.room === room)) passed.add(room)
    const bySize = [...planners].sort((a, b) => b.energyCapacityAvailable - a.energyCapacityAvailable)
    for (const home of bySize) {
      const mined = minedRooms()
      const reach = new Set(this.roomsInReach(home.name, maxRoute(home.controller!.level)).map(([room]) => room))
      const offered = [...passed].filter(room => owners.get(room) !== home.name && reach.has(room) && !mined.has(room))
      if (offered.length <= 0) continue
      const before = plans.get(home.name)!
      const lines = this.report.length
      const plan = this.choose(home, origins.get(home.name)!, new Set([...own(home), ...offered]))
      const taken = [...new Set(plan.chosen.map(r => r.room))].filter(room => offered.includes(room))
      if (taken.length <= 0) {
        // Nothing gained: keep the first plan (and its report lines, not this one's).
        this.report.splice(lines)
        if (before.highway.length) setHighway(home.name, before.highway)
        else if (Memory.highways) delete Memory.highways[home.name]
        continue
      }
      plans.set(home.name, plan)
      for (const room of taken) {
        this.report.push(`${room}: passed on by ${owners.get(room) ?? "its owner"}, mined from ${home.name} instead`)
        owners.set(room, home.name)
        passed.delete(room)
      }
    }

    const remotes: { [id: string]: RemoteSource } = {}
    for (const plan of plans.values()) for (const source of plan.chosen) remotes[source.id] = source
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

  /**
   * Hostiles where our remote creeps work: remote rooms, and rooms our remote creeps are in (on the way to one). If the
   * home can send defenders that win (see defence/remoteDefence), they're spawned (RemoteDefenderSpawnHandler) and
   * the room's remote creeps only stay out until it's clear; if not, the room is paused for PAUSE_TICKS.
   */
  private watchForThreats(): void {
    const paused = (Memory.remotePaused = Memory.remotePaused ?? {})
    for (const name in paused) if (paused[name] <= Game.time) delete paused[name]
    forgetStaleThreats()

    const watch = new Map<string, string>()
    for (const c of Object.values(Game.creeps))
      if (REMOTE_ROLES.includes(c.memory.role) && c.room.name !== c.memory.room) watch.set(c.room.name, c.memory.room)
    for (const r of Object.values(Memory.remotes ?? {})) watch.set(r.room, r.home)

    for (const [name, homeName] of watch) {
      const room = Game.rooms[name]
      const home = Game.rooms[homeName]
      if (!room || !home) continue
      const threat = assessRemoteThreat(room, home)
      if (!threat || threat.defenders) continue
      if (!paused[name] || paused[name] < Game.time + DEFENDED_PAUSE_TICKS)
        console.log(`Remote ${name}: hostiles we can't beat, pausing for ${PAUSE_TICKS} ticks`)
      paused[name] = Math.max(paused[name] ?? 0, Game.time + PAUSE_TICKS)
    }

    // Rooms being defended: keep the miners and haulers out until the defenders have cleared them.
    for (const [name, threat] of Object.entries(Memory.remoteThreats ?? {}))
      if (threat.defenders) paused[name] = Math.max(paused[name] ?? 0, Game.time + DEFENDED_PAUSE_TICKS)
  }

  /**
   * Which base each room in reach belongs to (see the top of this file): the base mining it now if that base can still
   * reach it, else the nearest by rooms, then the bigger. Rooms only one base reaches are simply that base's.
   */
  private assignRooms(homes: Room[]): Map<string, string> {
    const current = new Map<string, string>()
    for (const r of Object.values(Memory.remotes ?? {})) current.set(r.room, r.home)

    const contenders = new Map<string, { home: Room; distance: number }[]>()
    for (const home of homes)
      for (const [room, distance] of this.roomsInReach(home.name, maxRoute(home.controller!.level)))
        contenders.set(room, [...(contenders.get(room) ?? []), { home, distance }])

    const owners = new Map<string, string>()
    for (const [room, options] of contenders) {
      const sticky = options.find(o => o.home.name === current.get(room))
      const best =
        sticky ??
        options.sort(
          (a, b) =>
            a.distance - b.distance ||
            b.home.energyCapacityAvailable - a.home.energyCapacityAvailable ||
            a.home.name.localeCompare(b.home.name)
        )[0]
      owners.set(room, best.home.name)
    }
    return owners
  }

  /**
   * The sources `home` mines, from the rooms in `rooms` (those it owns, see assignRooms, and any offered to it), and
   * the rooms it weighed sources in (mineable and reachable), whether or not it chose them.
   */
  private choose(home: Room, origin: RoomPosition, rooms: Set<string>): Plan {
    const level = home.controller!.level
    const reach = maxRoute(level)
    const roadsOn = ROAD_MIN_RCL <= level
    const roads = roadsOn && ROADS_BUILT_SHARE <= builtShare(home.name)
    const capacity = home.energyCapacityAvailable
    // Reserved by this home if it can afford a reserver, otherwise by a stronger base nearby (see remote/reserving).
    const canReserve = (room: string) => reservingBase(room, home.name) !== null
    // The room mined is at most `reach` rooms away, but the path there may detour through others (walls between rooms).
    const maxRooms = 2 * reach + 3

    // Every candidate, scored on its own route (as if it paid for all of its road).
    const candidates: (Candidate & { score: RemoteSource })[] = []
    const considered = new Set<string>()
    for (const [roomName] of this.roomsInReach(home.name, reach)) {
      if (!rooms.has(roomName)) continue
      const why = this.whyNotMineable(roomName, home)
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
        considered.add(roomName)
        candidates.push({
          ...c,
          score: score(c, home.name, capacity, canReserve(roomName), roadsOn, roads, route.roadCost)
        })
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
    /** Each chosen source's score before the shares added below (reserver, maintainer), to re-score in connectRoom. */
    const raw = new Map<string, RemoteSource>()
    for (const c of candidates) {
      const route =
        (shared.size ? planRoute(origin, new RoomPosition(c.source.x, c.source.y, c.room), shared, maxRooms) : null) ??
        c.route
      const newRoad = route.tiles
        .filter(t => !shared.has(`${t.roomName}:${t.x * 50 + t.y}`))
        .reduce((sum, t) => sum + roadBuildCost(t), 0)
      // The highway already reaches this room: this source gets its branch too (see connectRoom).
      const connect = chosen.some(x => x.room === c.room && x.road)
      const s = score(
        { ...c, route },
        home.name,
        capacity,
        canReserve(c.room),
        roadsOn,
        roads,
        newRoad,
        connect
      )
      raw.set(s.id, s)

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

    // Sources chosen without a road before another in their room got one: connect them now.
    if (roadsOn)
      for (let i = 0; i < chosen.length; i++) {
        const x = chosen[i]
        if (x.road || !chosen.some(y => y.room === x.room && y.road)) continue
        const connected = this.connectRoom(home, origin, x, raw.get(x.id)!, shared, highway, capacity, roads, maxRooms)
        if (connected) chosen[i] = connected
      }

    if (0 < highway.length) setHighway(home.name, highway)
    else if (Memory.highways) delete Memory.highways[home.name]
    return { chosen, considered, highway }
  }

  /**
   * Give a chosen source without a road its branch off the highway that already reaches its room: its route re-planned
   * onto the roads chosen (so only the branch is new), re-scored with the road, and its net and spawn load moved by
   * the difference (the reserver and maintainer shares added when it was chosen stay as they were). Null if there's
   * no route to it.
   */
  private connectRoom(
    home: Room,
    origin: RoomPosition,
    chosen: RemoteSource,
    before: RemoteSource,
    shared: Set<string>,
    highway: RoomPosition[],
    capacity: number,
    roads: boolean,
    maxRooms: number
  ): RemoteSource | null {
    const route = planRoute(origin, new RoomPosition(chosen.x, chosen.y, chosen.room), shared, maxRooms)
    if (!route) return null
    const branch = route.tiles.filter(t => !shared.has(`${t.roomName}:${t.x * 50 + t.y}`))
    const newRoad = branch.reduce((sum, t) => sum + roadBuildCost(t), 0)
    const source = { id: chosen.id, x: chosen.x, y: chosen.y }
    const after = score({ source, room: chosen.room, route }, home.name, capacity, chosen.reserve, true, roads, newRoad, true)
    for (const k of routeKeys(route)) shared.add(k)
    highway.push(...route.tiles)
    this.report.push(
      `${home.name} -> ${chosen.room} source ${chosen.x},${chosen.y}: road added (${branch.length} new tiles) so the highway reaches every source in the room`
    )
    return {
      ...after,
      net: +(chosen.net + after.net - before.net).toFixed(2),
      spawnLoad: +(chosen.spawnLoad + after.spawnLoad - before.spawnLoad).toFixed(3)
    }
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
   * (allies included) may own or reserve it. A room reserved by a weaker player may be taken (see remote/contest).
   */
  private whyNotMineable(roomName: string, home: Room): string | null {
    const intel = Memory.rooms[roomName]?.intel
    if (!intel) return "not scouted yet"
    if (!intel.controller || !intel.sourcePositions?.length) return "no controller or sources"
    if (0 < (intel.keeperLairs ?? 0)) return "source keepers"
    if (intel.controller.owner)
      return Memory.razedRooms?.[roomName]
        ? `razed ${intel.controller.owner}'s base: the game doesn't allow harvesting while they own the controller; mined once it's free`
        : `owned by ${intel.controller.owner}`
    if (0 < intel.hostileStructures) return "hostile structures"
    if (intel.controller.reservedBy && intel.controller.reservedBy !== myUsername())
      return considerContest(home, roomName, intel.controller.reservedBy)
    // A room being defended stays mined (its creeps just keep out until it's clear); one we can't defend doesn't.
    if (Memory.remotePaused?.[roomName] && !Memory.remoteThreats?.[roomName]?.defenders) return "paused for hostiles"
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
 * road not already on the highway (routes share roads); building is spread over ROAD_AMORTIZE_TICKS. The spawn time
 * the road saves (fewer hauler parts) counts too, at SPAWN_TIME_VALUE, though it isn't part of the net reported.
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
  newRoad: number,
  /** Give it a road whether or not it pays for itself (its room is on the highway already, see connectRoom). */
  forceRoad = false
): RemoteSource {
  const income = (reserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME
  const miner = minerBody(capacity, income, roadsOn && roadsBuilt)
  const carryFor = (withRoads: boolean) =>
    Math.ceil((income * (roundTrip(c.route, withRoads) + TRIP_OVERHEAD) * HAULER_MARGIN) / CARRY_CAPACITY)
  const container = CONTAINER_UPKEEP + CONSTRUCTION_COST[STRUCTURE_CONTAINER] / AMORTIZE_TICKS

  const option = (withRoad: boolean) => {
    const carry = carryFor(withRoad)
    const perCarry = haulerCostPerCarry()
    const creeps = (bodyCost(miner) + carry * perCarry.energy) / CREEP_LIFE_TIME
    const road = withRoad ? newRoad / ROAD_AMORTIZE_TICKS + c.route.roadUpkeep : 0
    const haulerParts = carry * perCarry.parts
    const load = ((miner.length + haulerParts) * CREEP_SPAWN_TIME) / CREEP_LIFE_TIME
    const net = income - creeps - container - road
    return { net, haulerParts, value: net - load * SPAWN_TIME_VALUE }
  }
  const without = option(false)
  const withRoad = roadsOn ? option(true) : null
  const road = withRoad !== null && (forceRoad || without.value < withRoad.value)
  const chosen = road ? withRoad! : without

  const roads = road && roadsBuilt
  const carryParts = carryFor(roads)
  const haulerParts = Math.max(carryParts * haulerCostPerCarry().parts, chosen.haulerParts)
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
    creepRoles.HIGHWAY_MAINTAINER,
    creepRoles.REMOTE_DEFENDER
  ]
  const homeLoad = Object.values(Game.creeps)
    .filter(c => c.memory.room === home.name && !remoteRoles.includes(c.memory.role))
    .reduce((sum, c) => {
      const life = c.body.some(p => p.type === CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
      return sum + (c.body.length * CREEP_SPAWN_TIME) / life
    }, 0)
  return spawns * (1 - SPAWN_HEADROOM) - homeLoad
}
