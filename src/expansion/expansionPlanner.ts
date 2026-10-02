import { myUsername } from "utils/username"
import { recordIntel, RoomIntel } from "./intel"
import { controls } from "config/controls"

/**
 * Goal: Decide when and where to expand, and drive the expansion through to a working spawn in the new room.
 *
 * When: there's a free GCL slot, a home room at MIN_HOME_RCL or above (a tower to defend it and enough capacity for
 * the claimer and pioneers), no raid at home, and no other expansion underway.
 *
 * Where: the best-scoring room from scouted intel, between MIN_DISTANCE and MAX_DISTANCE rooms away by route (see
 * scoreRoom). Adjacent rooms are left for remote mining.
 *
 * Then Memory.expansion steps through:
 *   claiming - a claimer (ClaimerSpawnHandler/ClaimerHandler) claims the controller
 *   building - pioneers (ExpanderSpawnHandler/ExpanderHandler) build the new room's first spawn
 * and is cleared once the spawn exists, after which the new room runs itself. A target that gets owned or reserved
 * by someone else, defended, or takes too long is abandoned and blacklisted for a while.
 */

export const MIN_HOME_RCL = 3
const MIN_DISTANCE = 2
const MAX_DISTANCE = 6
const CLAIM_TIMEOUT = 3000
const BUILD_TIMEOUT = 15000
const BLACKLIST_TICKS = 20000
const PLAN_INTERVAL = 10

export interface ExpansionMemory {
  target: string
  home: string
  state: "claiming" | "building"
  started: number
}

declare global {
  interface Memory {
    expansion?: ExpansionMemory
    /** Rooms not to expand to until the given tick. */
    expansionBlacklist?: { [roomName: string]: number }
  }
}

export default class ExpansionPlanner {
  public run(): void {
    for (const name in Game.rooms) recordIntel(Game.rooms[name])
    if (Game.time % PLAN_INTERVAL !== 0) return

    const expansion = Memory.expansion
    if (expansion) this.advance(expansion)
    else this.maybeStart()
  }

  private maybeStart(): void {
    // Expansion switched off (see config/controls): finish one underway (see run), start none.
    if (!controls().expansion) return
    const owned = Object.values(Game.rooms).filter(r => r.controller?.my)
    if (Game.gcl.level <= owned.length) return

    const homes = owned.filter(
      r =>
        MIN_HOME_RCL <= (r.controller?.level ?? 0) &&
        0 < r.find(FIND_MY_SPAWNS).length &&
        r.memory.raidStart === undefined &&
        BODYPART_COST[CLAIM] + 2 * BODYPART_COST[MOVE] <= r.energyCapacityAvailable
    )
    if (homes.length <= 0) return

    let best: { target: string; home: string; score: number } | null = null
    for (const roomName in Memory.rooms) {
      for (const home of homes) {
        const score = scoreRoom(roomName, home.name)
        if (score !== null && (!best || best.score < score)) best = { target: roomName, home: home.name, score }
      }
    }
    if (!best) return

    Memory.expansion = { target: best.target, home: best.home, state: "claiming", started: Game.time }
    console.log(`Expansion: claiming ${best.target} from ${best.home} (score ${best.score.toFixed(1)})`)
  }

  private advance(expansion: ExpansionMemory): void {
    const room = Game.rooms[expansion.target]
    if (room) recordIntel(room, true)
    const intel = Memory.rooms[expansion.target]?.intel
    const me = myUsername()

    if (expansion.state === "claiming") {
      if (room?.controller?.my) {
        expansion.state = "building"
        expansion.started = Game.time
        console.log(`Expansion: claimed ${expansion.target}, building its spawn`)
        return
      }
      const takenByOthers =
        (intel?.controller?.owner && intel.controller.owner !== me) ||
        (intel?.controller?.reservedBy && intel.controller.reservedBy !== me) ||
        0 < (intel?.hostileStructures ?? 0)
      if (takenByOthers) return this.abandon(expansion, "taken or defended by someone else")
      if (CLAIM_TIMEOUT < Game.time - expansion.started) return this.abandon(expansion, "claim timed out")
      return
    }

    // building
    if (!room || !room.controller?.my) return this.abandon(expansion, "lost the controller")
    if (0 < room.find(FIND_MY_SPAWNS).length) {
      console.log(`Expansion: ${expansion.target} has its spawn`)
      delete Memory.expansion
      return
    }
    if (BUILD_TIMEOUT < Game.time - expansion.started) return this.abandon(expansion, "spawn took too long")
    ensureSpawnSite(room)
  }

  private abandon(expansion: ExpansionMemory, why: string): void {
    console.log(`Expansion: abandoning ${expansion.target} (${why})`)
    Memory.expansionBlacklist = Memory.expansionBlacklist ?? {}
    Memory.expansionBlacklist[expansion.target] = Game.time + BLACKLIST_TICKS
    const room = Game.rooms[expansion.target]
    if (expansion.state === "building" && room?.controller?.my && room.find(FIND_MY_SPAWNS).length === 0)
      room.controller.unclaim()
    delete Memory.expansion
  }
}

/**
 * Higher is better; null means not a candidate. Scored from intel:
 * - sources: each is worth 40 (a 2-source room doubles income)
 * - distance: 2-3 rooms is ideal (close enough to reinforce, far enough not to compete with remote mining)
 * - terrain: swamp slows everything; lots of wall leaves no room for a base
 * - layout: sources far from the controller mean long hauls for upgrading
 * - hostile fighters seen there
 */
export function scoreRoom(roomName: string, home: string): number | null {
  const intel: RoomIntel | undefined = Memory.rooms[roomName]?.intel
  if (!intel?.controller || intel.sources <= 0) return null

  const me = myUsername()
  if (intel.controller.owner) return null
  if (intel.controller.reservedBy && intel.controller.reservedBy !== me) return null
  if (0 < intel.hostileStructures) return null
  if (Game.time < (Memory.expansionBlacklist?.[roomName] ?? 0)) return null
  if (!sameMapZone(roomName, home)) return null

  const route = Game.map.findRoute(home, roomName)
  if (route === ERR_NO_PATH) return null
  const distance = route.length
  if (distance < MIN_DISTANCE || MAX_DISTANCE < distance) return null

  return (
    intel.sources * 40 -
    Math.max(0, distance - 3) * 10 -
    intel.swampRatio * 50 -
    Math.max(0, intel.wallRatio - 0.4) * 100 -
    intel.controllerToSources * 0.5 -
    intel.hostileFighters * 10
  )
}

/** Rooms in different zones (novice/respawn areas, closed rooms) can't be claimed from each other. */
function sameMapZone(a: string, b: string): boolean {
  try {
    const statusA = Game.map.getRoomStatus(a)
    const statusB = Game.map.getRoomStatus(b)
    return statusA.status !== "closed" && statusA.status === statusB.status
  } catch {
    return true
  }
}

/**
 * The new room's first spawn: the construction composer's layout places it once the room has a build order, but
 * make sure there is one even if no layout fits.
 */
function ensureSpawnSite(room: Room): void {
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_SPAWN })
  if (0 < sites.length) return

  const planned = (room.memory.buildOrder || []).find(s => s.structureType === STRUCTURE_SPAWN)
  if (planned && room.createConstructionSite(planned.x, planned.y, STRUCTURE_SPAWN) === OK) return

  const pos = openSpawnPos(room)
  if (pos) room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN)
}

/** Open ground with a clear 7x7 area around it, as close as possible to the sources and controller combined. */
function openSpawnPos(room: Room): { x: number; y: number } | null {
  const terrain = room.getTerrain()
  const targets = [...room.find(FIND_SOURCES).map(s => s.pos), ...(room.controller ? [room.controller.pos] : [])]
  const CLEAR = 3
  let best: { x: number; y: number; cost: number } | null = null
  for (let y = 2 + CLEAR; y < 48 - CLEAR; y++) {
    for (let x = 2 + CLEAR; x < 48 - CLEAR; x++) {
      let clear = true
      for (let dy = -CLEAR; dy <= CLEAR && clear; dy++)
        for (let dx = -CLEAR; dx <= CLEAR && clear; dx++) clear = terrain.get(x + dx, y + dy) !== TERRAIN_MASK_WALL
      if (!clear) continue
      const cost = targets.reduce((sum, p) => sum + Math.max(Math.abs(p.x - x), Math.abs(p.y - y)), 0)
      if (!best || cost < best.cost) best = { x, y, cost }
    }
  }
  return best
}
