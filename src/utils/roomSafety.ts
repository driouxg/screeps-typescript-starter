import { isHostilePlayer } from "config/relations"
import { isRazedMineable } from "remote/razed"

/**
 * Rooms our creeps must not path through: owned by a hostile player (see config/relations; their towers shoot on
 * sight). Allies' and neutral players' rooms are fine to cross, and so are source keeper rooms: paths there keep out
 * of the keepers' reach (see keeperZones). Judged from intel, so it works without vision;
 * rooms we know nothing about are assumed passable. A base of theirs we razed and is clear (see remote/razed) is
 * passable too: nothing there shoots any more, and we mine it.
 */
export function isHostileRoom(roomName: string): boolean {
  const intel = Memory.rooms?.[roomName]?.intel
  if (!intel || isRazedMineable(roomName)) return false
  return isHostilePlayer(intel.controller?.owner)
}

/** A cost matrix no path can cross, for rooms to avoid entirely. */
export function blockedMatrix(): CostMatrix {
  const matrix = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) matrix.set(x, y, 0xff)
  return matrix
}

/** Rooms in different zones (novice/respawn areas, closed rooms) can't be reached or claimed from each other. */
export function sameMapZone(a: string, b: string): boolean {
  try {
    const statusA = Game.map.getRoomStatus(a)
    const statusB = Game.map.getRoomStatus(b)
    return statusA.status !== "closed" && statusA.status === statusB.status
  } catch {
    return true
  }
}
