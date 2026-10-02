import { myUsername } from "utils/username"
import { recordIntel } from "./intel"
import { controls } from "config/controls"
import { sameMapZone } from "utils/roomSafety"
import { ExpansionCandidate, expansionCandidates, whyNotClaimable } from "./candidates"
import { abandonBases } from "./abandonBase"

/**
 * Goal: Decide when and where to expand, and drive the expansion through to a working spawn in the new room.
 *
 * When: there's a free GCL slot, a home room at MIN_HOME_RCL or above (a tower to defend it and enough capacity for
 * the claimer and pioneers), no raid at home, and no other expansion underway.
 *
 * Where: the best-scoring room from scouted intel (see candidates): it must have two sources, unless there is really
 * nowhere better.
 *
 * Or the player picks the room (Memory.expansionRequest, from the dashboard): any room with a free controller that a
 * claimer can reach, whatever its sources or distance, and whether or not automatic expansion is switched on. The
 * request waits (with a status saying why) until there's a free GCL level and a home to send the claimer from; it
 * takes over from an expansion that's still claiming. `{ cancel: true }` abandons the expansion underway.
 *
 * Then Memory.expansion steps through:
 *   claiming - a claimer (ClaimerSpawnHandler/ClaimerHandler) claims the controller
 *   building - pioneers (ExpanderSpawnHandler/ExpanderHandler) build the new room's first spawn
 * and is cleared once the spawn exists, after which the new room runs itself. A target that gets owned or reserved
 * by someone else, defended, or takes too long is abandoned and blacklisted for a while.
 *
 * Bases the player gives up on are torn down by abandonBases (see abandonBase).
 */

export const MIN_HOME_RCL = 3
/** A claimer lives 600 ticks: further than this many rooms, it dies on the way. */
const MAX_CLAIM_ROUTE = 10
const CLAIM_TIMEOUT = 3000
const BUILD_TIMEOUT = 15000
const BLACKLIST_TICKS = 20000
const PLAN_INTERVAL = 10

export interface ExpansionMemory {
  target: string
  home: string
  state: "claiming" | "building"
  started: number
  /** Picked by the player (see Memory.expansionRequest), not by the planner. */
  manual?: boolean
}

export interface ExpansionRequest {
  target?: string
  cancel?: boolean
  /** Why it hasn't been acted on yet, written by the bot. */
  status?: string
}

declare global {
  interface Memory {
    expansion?: ExpansionMemory
    /** Rooms not to expand to until the given tick. */
    expansionBlacklist?: { [roomName: string]: number }
    /** Set from the dashboard: expand to this room, or cancel the expansion underway (see ExpansionPlanner). */
    expansionRequest?: ExpansionRequest | null
  }
}


export default class ExpansionPlanner {
  public run(): void {
    for (const name in Game.rooms) recordIntel(Game.rooms[name])
    abandonBases()
    if (Game.time % PLAN_INTERVAL !== 0) return

    this.handleRequest()
    const expansion = Memory.expansion
    if (expansion) this.advance(expansion)
    else this.maybeStart()
  }

  private maybeStart(): void {
    // Expansion switched off (see config/controls): finish one underway (see run), start none.
    if (!controls().expansion) return
    if (!freeGclLevel()) return

    let best: ExpansionCandidate | null = null
    for (const home of eligibleHomes()) {
      const top = expansionCandidates(home.name).candidates[0]
      if (top && (!best || best.score < top.score)) best = top
    }
    if (!best) return

    Memory.expansion = { target: best.room, home: best.home, state: "claiming", started: Game.time }
    console.log(`Expansion: claiming ${best.room} from ${best.home} (score ${best.score.toFixed(1)})`)
  }

  /** The player's pick from the dashboard (see the top of this file). */
  private handleRequest(): void {
    const request = Memory.expansionRequest
    if (!request) {
      if (request === null) delete Memory.expansionRequest
      return
    }
    const expansion = Memory.expansion
    if (request.cancel) {
      if (expansion) this.abandon(expansion, "cancelled from the dashboard")
      delete Memory.expansionRequest
      return
    }

    const target = request.target
    if (!target || !/^[WE]\d+[NS]\d+$/.test(target) || expansion?.target === target) {
      delete Memory.expansionRequest
      return
    }
    const wait = (status: string) => {
      if (request.status !== status) console.log(`Expansion request ${target}: ${status}`)
      request.status = status
    }

    if (expansion?.state === "building") return wait(`waiting for ${expansion.target} to get its spawn`)
    const why = whyNotClaimable(target)
    if (why) return wait(`can't expand there: ${why}`)
    if (!freeGclLevel()) return wait("waiting for a free GCL level")

    const homes = eligibleHomes()
    if (homes.length <= 0) return wait(`waiting for a home at RCL ${MIN_HOME_RCL}+ with a spawn and no raid`)
    let home: { name: string; distance: number } | null = null
    for (const h of homes) {
      if (!sameMapZone(h.name, target)) continue
      const route = Game.map.findRoute(h.name, target)
      if (route !== ERR_NO_PATH && (!home || route.length < home.distance))
        home = { name: h.name, distance: route.length }
    }
    if (!home) return wait("no route from any of our rooms")
    if (MAX_CLAIM_ROUTE < home.distance)
      return wait(`${home.distance} rooms away: a claimer (600 ticks of life) can't get further than ${MAX_CLAIM_ROUTE}`)

    if (Memory.expansionBlacklist) delete Memory.expansionBlacklist[target]
    if (expansion) console.log(`Expansion: dropping ${expansion.target} for the player's pick`)
    Memory.expansion = { target, home: home.name, state: "claiming", started: Game.time, manual: true }
    delete Memory.expansionRequest
    console.log(`Expansion: claiming ${target} from ${home.name} (picked from the dashboard)`)
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
      // A room picked from the dashboard may not have been scouted.
      if (room && !room.controller) return this.abandon(expansion, "no controller")
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

function freeGclLevel(): boolean {
  const owned = Object.values(Game.rooms).filter(r => r.controller?.my).length
  return owned < Game.gcl.level
}

/** Rooms that can send a claimer and pioneers. */
function eligibleHomes(): Room[] {
  return Object.values(Game.rooms).filter(
    r =>
      r.controller?.my &&
      MIN_HOME_RCL <= r.controller.level &&
      0 < r.find(FIND_MY_SPAWNS).length &&
      r.memory.raidStart === undefined &&
      BODYPART_COST[CLAIM] + 2 * BODYPART_COST[MOVE] <= r.energyCapacityAvailable
  )
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
