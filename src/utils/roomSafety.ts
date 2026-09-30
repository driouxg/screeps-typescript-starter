import { isAlly } from "config/allies"
import { myUsername } from "./username"

/**
 * Rooms our creeps must not path through: owned by a player who isn't us or an ally (their towers shoot on sight),
 * or source keeper rooms (keepers attack anything near their sources). Judged from intel, so it works without vision;
 * rooms we know nothing about are assumed passable.
 */
export function isHostileRoom(roomName: string): boolean {
  const intel = Memory.rooms?.[roomName]?.intel
  if (!intel) return false
  if (0 < (intel.keeperLairs ?? 0)) return true
  const owner = intel.controller?.owner
  return !!owner && owner !== myUsername() && !isAlly(owner)
}

/** A cost matrix no path can cross, for rooms to avoid entirely. */
export function blockedMatrix(): CostMatrix {
  const matrix = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) matrix.set(x, y, 0xff)
  return matrix
}
