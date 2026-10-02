import { controls } from "config/controls"
import { MAX_REMOTE_ROUTE } from "remote/remotePlanner"
import { isHostileRoom, sameMapZone } from "utils/roomSafety"
import { MAX_DISTANCE, scoreRoom } from "./expansionPlanner"

/**
 * Goal: Know the rooms around each home well enough to pick remotes (see RemotePlanner) and expansion targets (see
 * ExpansionPlanner), without spending more on scouts than that takes.
 *
 * A home needs scouting (needsScouting) while there's something left to find:
 *   - a room remote mining could reach (MAX_REMOTE_ROUTE) we've never seen, or
 *   - with expansion on, no room we'd expand to yet and rooms within MAX_DISTANCE we've never seen.
 * Then a scout is kept out at all times, ahead of the workers (ScoutSpawnHandler "needed"); otherwise one goes out
 * now and then just to keep intel fresh ("refresh").
 *
 * Rooms a scout can't get to (closed off, or it keeps dying on the way) would hold scouting up forever, so each trip
 * towards an unseen room counts as an attempt; after MAX_ATTEMPTS without seeing it, it's left alone for BLOCKED_TICKS.
 */

/** How far (in rooms) scouts explore from home: as far as expansion looks. */
export const SCOUT_RANGE = MAX_DISTANCE
const MAX_ATTEMPTS = 3
const BLOCKED_TICKS = 20000
/** Rooms where fighters were seen are left alone this long. */
const AGGRESSIVE_TICKS = 1500
/** The rooms around each home and whether it needs scouting are worked out this often. */
const CACHE_TICKS = 50

declare global {
  interface RoomMemory {
    /** Scouts sent towards this room since it was last seen (see scouting). */
    scoutAttempts?: number
    /** Scouts don't try this room until the given tick: they couldn't get there. */
    scoutBlocked?: number
    /** When the room's last scout was spawned (see ScoutSpawnHandler). */
    scoutLastSpawned?: number
  }
}

const reachCache = new Map<string, { tick: number; rooms: Map<string, number> }>()
const needCache = new Map<string, { tick: number; needed: boolean }>()

/**
 * Rooms a scout from `home` can go to, with their distance in rooms: within SCOUT_RANGE, by exits that avoid hostile
 * rooms, other map zones (novice/respawn areas) and rooms scouts couldn't get to. Uses the map's exits, so it needs
 * no vision.
 */
export function scoutableRooms(home: string): Map<string, number> {
  const cached = reachCache.get(home)
  if (cached && Game.time - cached.tick < CACHE_TICKS) return cached.rooms

  const rooms = new Map<string, number>([[home, 0]])
  let frontier = [home]
  for (let d = 1; d <= SCOUT_RANGE && 0 < frontier.length; d++) {
    const next: string[] = []
    for (const room of frontier)
      for (const name of Object.values(Game.map.describeExits(room) ?? {})) {
        if (!name || rooms.has(name)) continue
        if (isHostileRoom(name) || isBlocked(name) || !sameMapZone(name, home)) continue
        rooms.set(name, d)
        next.push(name)
      }
    frontier = next
  }
  rooms.delete(home)
  reachCache.set(home, { tick: Game.time, rooms })
  return rooms
}

/** Whether `home` still has rooms worth discovering (see the top of this file). */
export function needsScouting(home: string): boolean {
  const cached = needCache.get(home)
  if (cached && Game.time - cached.tick < CACHE_TICKS) return cached.needed

  const rooms = scoutableRooms(home)
  const unseen = [...rooms].filter(([name]) => !Memory.rooms[name]?.intel)
  const needed =
    unseen.some(([, d]) => d <= MAX_REMOTE_ROUTE) ||
    (controls().expansion && 0 < unseen.length && ![...rooms.keys()].some(name => scoreRoom(name, home) !== null))

  needCache.set(home, { tick: Game.time, needed })
  return needed
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
      reachCache.delete(home)
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

function isBlocked(roomName: string): boolean {
  return Game.time < (Memory.rooms[roomName]?.scoutBlocked ?? 0)
}

function recentlyAggressive(roomName: string): boolean {
  const memory = Memory.rooms[roomName]
  return memory?.status === "aggressive" && Game.time < (memory.lastScouted ?? 0) + AGGRESSIVE_TICKS
}
