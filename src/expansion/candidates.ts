import { myUsername } from "utils/username"
import { sameMapZone } from "utils/roomSafety"
import { RoomIntel } from "./intel"
import { scoutableRooms } from "./scoutRange"

/**
 * Goal: Rank the rooms we could expand to (see ExpansionPlanner), from scouted intel.
 *
 * A candidate is between MIN_DISTANCE and MAX_DISTANCE rooms from home by route (adjacent rooms are left for remote
 * mining), has a free controller and at least MIN_SOURCES sources. A one-source room is only a candidate once we know
 * of no MIN_SOURCES room we could take within FALLBACK_RANGE (linear) of home, and nothing within scouting range is
 * left unseen: there's really nowhere better.
 */

const MIN_DISTANCE = 2
export const MAX_DISTANCE = 6
const MIN_SOURCES = 2
/** A one-source room is only an option when no MIN_SOURCES room we could take is known within this linear range. */
const FALLBACK_RANGE = 20
/** Candidates are worked out this often (they come from intel, which changes slowly). */
const CANDIDATE_TICKS = 50

export interface ExpansionCandidate {
  room: string
  home: string
  score: number
  sources: number
  /** Rooms away from home by route. */
  distance: number
}

const candidateCache = new Map<string, { tick: number; candidates: ExpansionCandidate[]; singleSource: boolean }>()

/**
 * Why we can't claim a room, from intel, or null if we can (or don't know: a room picked from the dashboard may not
 * have been scouted; the claimer finds out).
 */
export function whyNotClaimable(roomName: string): string | null {
  const intel: RoomIntel | undefined = Memory.rooms[roomName]?.intel
  if (!intel) return null
  if (!intel.controller) return "no controller"
  if (intel.controller.owner) return `owned by ${intel.controller.owner}`
  if (intel.controller.reservedBy && intel.controller.reservedBy !== myUsername())
    return `reserved by ${intel.controller.reservedBy}`
  if (0 < intel.hostileStructures) return "hostile structures"
  return null
}

/**
 * Rooms we'd expand to from `home`, best first, and whether one-source rooms are allowed (see the top of this file).
 * Only scouted rooms between MIN_DISTANCE and MAX_DISTANCE by route.
 */
export function expansionCandidates(home: string): { candidates: ExpansionCandidate[]; singleSource: boolean } {
  const cached = candidateCache.get(home)
  if (cached && Game.time - cached.tick < CANDIDATE_TICKS) return cached

  const all: ExpansionCandidate[] = []
  let roomyNearby = false
  for (const roomName in Memory.rooms) {
    const intel = Memory.rooms[roomName].intel
    if (!intel || intel.sources <= 0 || whyNotClaimable(roomName)) continue
    if (Game.time < (Memory.expansionBlacklist?.[roomName] ?? 0) || !sameMapZone(roomName, home)) continue
    const linear = Game.map.getRoomLinearDistance(home, roomName)
    if (MIN_SOURCES <= intel.sources && linear <= FALLBACK_RANGE) roomyNearby = true

    // A route is never shorter than the linear distance: skip the pathfinding for rooms that can't be in range.
    if (MAX_DISTANCE < linear) continue
    const route = Game.map.findRoute(home, roomName)
    if (route === ERR_NO_PATH || route.length < MIN_DISTANCE || MAX_DISTANCE < route.length) continue
    all.push({ room: roomName, home, score: scoreRoom(intel, route.length), sources: intel.sources, distance: route.length })
  }

  const singleSource = !roomyNearby && ![...scoutableRooms(home).keys()].some(name => !Memory.rooms[name]?.intel)
  const candidates = all
    .filter(c => singleSource || MIN_SOURCES <= c.sources)
    .sort((a, b) => b.score - a.score)
    .map(c => ({ ...c, score: +c.score.toFixed(1) }))
  const result = { tick: Game.time, candidates, singleSource }
  candidateCache.set(home, result)
  return result
}

/**
 * Higher is better. Scored from intel:
 * - sources: each is worth 40 (a 2-source room doubles income)
 * - distance: 2-3 rooms is ideal (close enough to reinforce, far enough not to compete with remote mining)
 * - terrain: swamp slows everything; lots of wall leaves no room for a base
 * - layout: sources far from the controller mean long hauls for upgrading
 * - hostile fighters seen there
 */
function scoreRoom(intel: RoomIntel, distance: number): number {
  return (
    intel.sources * 40 -
    Math.max(0, distance - 3) * 10 -
    intel.swampRatio * 50 -
    Math.max(0, intel.wallRatio - 0.4) * 100 -
    intel.controllerToSources * 0.5 -
    intel.hostileFighters * 10
  )
}
