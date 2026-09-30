import { applyKeeperCosts } from "utils/keeperZones"
import * as creepRoles from "creeps/roles"
import { isHostile } from "config/relations"
import { myUsername } from "utils/username"
import { blockedMatrix, isHostileRoom } from "utils/roomSafety"

/**
 * Goal: Mine sources in nearby rooms when they're worth it, and stop when they're not safe.
 *
 * Every PLAN_INTERVAL ticks, for each owned room at MIN_RCL or above, every source within MAX_ROUTE rooms (by a route
 * that avoids hostile rooms, but may cross our own, neutral and allied rooms) is scored by its net energy per tick:
 *
 *   income   5/tick, or 10/tick once the room can afford a reserver (a reserved controller doubles the source)
 *   miner    ceil(income / 2) WORK parts (2 energy each), half as many MOVE, over its 1500 ticks
 *   haulers  CARRY to move `income` over a round trip of 2 * path length, one MOVE per CARRY
 *   reserver 2 CLAIM + 2 MOVE every 600 ticks (a CLAIM creep's life), shared by the room's sources
 *
 * Sources are chosen best first while they net at least MIN_NET and the spawn time they need stays under
 * the spawn time left over (see spawnBudget). Rooms owned or reserved by anyone else (allies included), source keeper rooms and rooms with an
 * invader core are never mined. A room where hostile fighters show up is paused for PAUSE_TICKS: its creeps go home.
 */

export const MIN_RCL = 3
const MAX_ROUTE = 2
const PLAN_INTERVAL = 500
const MIN_NET = 1
/** Keep this share of spawn time free, for replacements, defenders and spikes in demand. */
const SPAWN_HEADROOM = 0.1
const PAUSE_TICKS = 1500
const RESERVER_BODY: BodyPartConstant[] = [CLAIM, CLAIM, MOVE, MOVE]
const RESERVER_COST = RESERVER_BODY.reduce((sum, p) => sum + BODYPART_COST[p], 0)

export interface RemoteSource {
  id: string
  room: string
  x: number
  y: number
  home: string
  /** Path length from home to the source. */
  distance: number
  reserve: boolean
  workParts: number
  carryParts: number
  net: number
}

declare global {
  interface Memory {
    remotes?: { [sourceId: string]: RemoteSource }
    /** The last plan's candidates and why each was or wasn't chosen, for checking from the console. */
    remoteReport?: string[]
    /** Remote rooms paused (hostiles seen) until the given tick. */
    remotePaused?: { [roomName: string]: number }
  }
}

export default class RemotePlanner {
  public run(): void {
    this.watchForThreats()
    if (Game.time % PLAN_INTERVAL !== 0 && Memory.remotes) return

    const remotes: { [id: string]: RemoteSource } = {}
    this.report = []
    for (const home of Object.values(Game.rooms)) {
      if (!home.controller?.my || home.controller.level < MIN_RCL) continue
      const origin = home.storage?.pos ?? home.find(FIND_MY_SPAWNS)[0]?.pos
      if (!origin) continue
      for (const source of this.choose(home, origin)) remotes[source.id] = source
    }
    Memory.remotes = remotes
    Memory.remoteReport = this.report
  }

  private report: string[] = []

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
    const canReserve = RESERVER_COST <= home.energyCapacityAvailable
    const candidates: RemoteSource[] = []

    for (const roomName of this.roomsInReach(home.name)) {
      const why = this.whyNotMineable(roomName)
      if (why) {
        this.report.push(`${home.name} -> ${roomName}: skipped, ${why}`)
        continue
      }
      for (const s of Memory.rooms[roomName].intel!.sourcePositions ?? []) {
        const distance = pathLength(origin, new RoomPosition(s.x, s.y, roomName))
        if (distance === null) {
          this.report.push(`${home.name} -> ${roomName} source ${s.x},${s.y}: no safe path`)
          continue
        }
        candidates.push(score(s.id, roomName, s.x, s.y, home.name, distance, canReserve))
      }
    }

    // Reserver cost is shared by the room's chosen sources: charge it to the room's first (best) source only when
    // the room has one chosen, then re-score so the net is right.
    candidates.sort((a, b) => b.net - a.net)
    const budget = spawnBudget(home)
    let spawnLoad = 0
    const chosen: RemoteSource[] = []
    const reservedRooms = new Set<string>()
    for (const c of candidates) {
      const reserverShare = c.reserve && !reservedRooms.has(c.room) ? RESERVER_COST / CREEP_CLAIM_LIFE_TIME : 0
      const net = c.net - reserverShare
      const load =
        spawnTime(c) + (reserverShare ? (RESERVER_BODY.length * CREEP_SPAWN_TIME) / CREEP_CLAIM_LIFE_TIME : 0)
      const verdict = net < MIN_NET ? "not worth it" : budget < spawnLoad + load ? "over the spawn budget" : "chosen"
      this.report.push(
        `${home.name} -> ${c.room} source ${c.x},${c.y}: distance ${c.distance}, net ${net.toFixed(1)}/tick, ${verdict}`
      )
      if (verdict !== "chosen") continue
      spawnLoad += load
      if (c.reserve) reservedRooms.add(c.room)
      chosen.push({ ...c, net: +net.toFixed(2) })
    }
    return chosen
  }

  /** Rooms within MAX_ROUTE of home by a route that avoids hostile rooms. */
  private roomsInReach(home: string): string[] {
    const found: string[] = []
    let frontier = [home]
    const seen = new Set(frontier)
    for (let d = 1; d <= MAX_ROUTE; d++) {
      const next: string[] = []
      for (const room of frontier)
        for (const name of Object.values(Game.map.describeExits(room) ?? {})) {
          if (!name || seen.has(name)) continue
          seen.add(name)
          if (isHostileRoom(name)) continue
          next.push(name)
          found.push(name)
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

function score(
  id: string,
  room: string,
  x: number,
  y: number,
  home: string,
  distance: number,
  reserve: boolean
): RemoteSource {
  const income = (reserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME
  const workParts = Math.ceil(income / HARVEST_POWER)
  const minerCost = workParts * BODYPART_COST[WORK] + Math.ceil(workParts / 2) * BODYPART_COST[MOVE]
  const carryParts = Math.ceil((2 * distance * income) / CARRY_CAPACITY)
  const haulerCost = carryParts * (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])
  const net = income - (minerCost + haulerCost) / CREEP_LIFE_TIME
  return { id, room, x, y, home, distance, reserve, workParts, carryParts, net }
}

/**
 * Spawn time (in spawns' worth) left for remote mining: the room's spawns, less headroom, less what the room's own
 * creeps take to keep replacing (body parts * CREEP_SPAWN_TIME per lifetime).
 */
function spawnBudget(home: Room): number {
  const spawns = home.find(FIND_MY_SPAWNS).length
  const remoteRoles = [creepRoles.REMOTE_DROP_MINER, creepRoles.REMOTE_HAULER, creepRoles.RESERVER]
  const homeLoad = Object.values(Game.creeps)
    .filter(c => c.memory.room === home.name && !remoteRoles.includes(c.memory.role))
    .reduce((sum, c) => {
      const life = c.body.some(p => p.type === CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
      return sum + (c.body.length * CREEP_SPAWN_TIME) / life
    }, 0)
  return spawns * (1 - SPAWN_HEADROOM) - homeLoad
}

/** Share of one spawn's time the source's miner and haulers take. */
function spawnTime(r: RemoteSource): number {
  const parts = r.workParts + Math.ceil(r.workParts / 2) + 2 * r.carryParts
  return (parts * CREEP_SPAWN_TIME) / CREEP_LIFE_TIME
}

/** Walking distance, avoiding hostile rooms; null if unreachable. */
function pathLength(from: RoomPosition, to: RoomPosition): number | null {
  const result = PathFinder.search(
    from,
    { pos: to, range: 1 },
    {
      plainCost: 1,
      swampCost: 5,
      maxOps: 20000,
      maxRooms: 2 * MAX_ROUTE + 1,
      roomCallback: roomName =>
        isHostileRoom(roomName) ? blockedMatrix() : applyKeeperCosts(roomName, new PathFinder.CostMatrix())
    }
  )
  return result.incomplete ? null : result.path.length
}
