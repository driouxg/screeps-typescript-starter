import { controls } from "config/controls"
import { MAX_REMOTE_ROUTE } from "remote/remotePlanner"
import { expansionCandidates } from "./candidates"
import { forgetScoutableRooms, scoutableRooms } from "./scoutRange"

/**
 * Goal: Know the rooms around each home well enough to pick remotes (see RemotePlanner) and expansion targets (see
 * ExpansionPlanner), without spending more on scouts than that takes.
 *
 * A home needs scouting (needsScouting) while there's something left to find:
 *   - a room remote mining could reach (MAX_REMOTE_ROUTE) we've never seen, or
 *   - with expansion on, no room we'd expand to yet (see expansionCandidates: it wants two sources) and rooms within
 *     MAX_DISTANCE we've never seen.
 * Then a scout is kept out at all times, ahead of the workers (ScoutSpawnHandler "needed"); otherwise one goes out
 * now and then just to keep intel fresh ("refresh").
 *
 * Rooms a scout can't get to (closed off, or it keeps dying on the way) would hold scouting up forever, so each trip
 * towards an unseen room counts as an attempt; after MAX_ATTEMPTS without seeing it, it's left alone for BLOCKED_TICKS.
 */

const MAX_ATTEMPTS = 3
const BLOCKED_TICKS = 20000
/** Rooms where fighters were seen are left alone this long. */
const AGGRESSIVE_TICKS = 1500
/** Whether a home needs scouting is worked out this often. */
const CACHE_TICKS = 50
/** Share of a home's scoutable rooms seen at least once before its scouts switch to wandering (see wellScouted). */
const WELL_SCOUTED_SHARE = 0.8

declare global {
  interface RoomMemory {
    /** Scouts sent towards this room since it was last seen (see scouting). */
    scoutAttempts?: number
    /** When the room's last scout was spawned (see ScoutSpawnHandler). */
    scoutLastSpawned?: number
  }
}

const needCache = new Map<string, { tick: number; needed: boolean }>()

/** Whether `home` still has rooms worth discovering (see the top of this file). */
export function needsScouting(home: string): boolean {
  const cached = needCache.get(home)
  if (cached && Game.time - cached.tick < CACHE_TICKS) return cached.needed

  const rooms = scoutableRooms(home)
  const unseen = [...rooms].filter(([name]) => !Memory.rooms[name]?.intel)
  const needed =
    unseen.some(([, d]) => d <= MAX_REMOTE_ROUTE) ||
    (controls().expansion && 0 < unseen.length && expansionCandidates(home).candidates.length <= 0)

  needCache.set(home, { tick: Game.time, needed })
  return needed
}

const wellCache = new Map<string, { tick: number; well: boolean }>()

/**
 * Whether enough of `home`'s area is known (WELL_SCOUTED_SHARE of its scoutable rooms, and nothing it still needs, see
 * needsScouting) for its scouts to stop choosing targets and just wander, which costs far less CPU.
 */
export function wellScouted(home: string): boolean {
  const cached = wellCache.get(home)
  if (cached && Game.time - cached.tick < CACHE_TICKS) return cached.well

  const rooms = [...scoutableRooms(home).keys()]
  const seen = rooms.filter(name => Memory.rooms[name]?.intel).length
  const well = WELL_SCOUTED_SHARE * rooms.length <= seen && !needsScouting(home)
  wellCache.set(home, { tick: Game.time, well })
  return well
}

/**
 * Where a scout from `home` standing in `current` goes next: unseen rooms nearest home first (remote mining range is
 * filled in before expansion range), then the room seen longest ago; nearest the scout on ties. Counts an attempt
 * on an unseen room it picks.
 */
export function nextScoutTarget(home: string, current: string): string | null {
  let best: { name: string; seen: number; homeDistance: number; distance: number } | null = null
  for (const [name, homeDistance] of scoutableRooms(home)) {
    if (name === current || recentlyAggressive(name)) continue
    const memory = Memory.rooms[name]
    if (memory && !memory.intel && MAX_ATTEMPTS <= (memory.scoutAttempts ?? 0)) {
      memory.scoutBlocked = Game.time + BLOCKED_TICKS
      delete memory.scoutAttempts
      forgetScoutableRooms(home)
      console.log(`Scouting: can't reach ${name}, skipping it for ${BLOCKED_TICKS} ticks`)
      continue
    }

    const seen = memory?.intel?.tick ?? -Infinity
    const distance = Game.map.getRoomLinearDistance(current, name)
    const better =
      !best ||
      seen < best.seen ||
      (seen === best.seen &&
        (homeDistance < best.homeDistance || (homeDistance === best.homeDistance && distance < best.distance)))
    // Unseen rooms all tie on `seen`; seen ones are ordered by age alone (ties are rare).
    if (better) best = { name, seen, homeDistance, distance }
  }
  if (!best) return null

  if (best.seen === -Infinity) {
    const memory = (Memory.rooms[best.name] = Memory.rooms[best.name] ?? ({} as RoomMemory))
    memory.scoutAttempts = (memory.scoutAttempts ?? 0) + 1
  }
  return best.name
}

/** A scout reached `roomName`: it's reachable after all. */
export function scoutArrived(roomName: string): void {
  const memory = Memory.rooms[roomName]
  if (!memory) return
  delete memory.scoutAttempts
  delete memory.scoutBlocked
}

function recentlyAggressive(roomName: string): boolean {
  const memory = Memory.rooms[roomName]
  return memory?.status === "aggressive" && Game.time < (memory.lastScouted ?? 0) + AGGRESSIVE_TICKS
}
