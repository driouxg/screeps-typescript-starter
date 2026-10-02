import { isHostileRoom, sameMapZone } from "utils/roomSafety"

/** How far (in rooms) scouts explore from home: as far as expansion looks (MAX_DISTANCE, see candidates). */
export const SCOUT_RANGE = 6
/** The rooms around each home are worked out this often. */
const CACHE_TICKS = 50

declare global {
  interface RoomMemory {
    /** Scouts don't try this room until the given tick: they couldn't get there (see scouting). */
    scoutBlocked?: number
  }
}

const reachCache = new Map<string, { tick: number; rooms: Map<string, number> }>()

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

/** Work out `home`'s rooms again next time (a room was just blocked). */
export function forgetScoutableRooms(home: string): void {
  reachCache.delete(home)
}

function isBlocked(roomName: string): boolean {
  return Game.time < (Memory.rooms[roomName]?.scoutBlocked ?? 0)
}
