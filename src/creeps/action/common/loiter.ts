import { smartMove } from "./movement"
import { isParkingSpot } from "./parking"

/**
 * Goal: Somewhere for defenders (and their healers) to wait after a fight that isn't in everyone's way: near where
 * the hostiles died (their tombstones), so they're still close if more come the same way, but on open ground: off
 * roads and structures and away from spawns, sources and the controller (see isParkingSpot), where they'd block the
 * haulers and miners getting back to work.
 */

/** How far from the tombstone to look for a free tile. */
const SEARCH_RADIUS = 6

declare global {
  interface CreepMemory {
    /** Where it waits after a fight (see loiter). */
    loiterPos?: { x: number; y: number; roomName: string }
  }
}

/**
 * Wait near the newest hostile tombstone in the room. Returns false (and does nothing) if there's none and no spot
 * was picked in this room earlier, so the caller can wait elsewhere. The spot is picked once and kept until the creep
 * leaves the room or stopLoitering is called.
 */
export function loiter(creep: Creep): boolean {
  const saved = creep.memory.loiterPos
  const previous = saved?.roomName === creep.room.name ? new RoomPosition(saved.x, saved.y, saved.roomName) : null
  let pos = previous
  if (pos && !creep.pos.isEqualTo(pos) && !isParkingSpot(creep.room, pos.x, pos.y, creep)) pos = null // taken

  if (!pos) {
    // Around the old spot if it was taken, otherwise around the newest hostile tombstone.
    const tombstone = previous
      ? null
      : creep.room.find(FIND_TOMBSTONES, { filter: t => !t.creep.my }).sort((a, b) => b.deathTime - a.deathTime)[0]
    const center = previous ?? tombstone?.pos
    pos = center ? spotNear(creep, center) : null
    if (!pos) {
      delete creep.memory.loiterPos
      return false
    }
    creep.memory.loiterPos = { x: pos.x, y: pos.y, roomName: pos.roomName }
  }

  if (!creep.pos.isEqualTo(pos)) smartMove(creep, pos, 0)
  return true
}

/** Back to work: forget the waiting spot. */
export function stopLoitering(creep: Creep): void {
  delete creep.memory.loiterPos
}

/** The free open tile nearest `center`, nearest the creep on ties. */
function spotNear(creep: Creep, center: RoomPosition): RoomPosition | null {
  for (let r = 1; r <= SEARCH_RADIUS; r++) {
    let best: RoomPosition | null = null
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring only
        const x = center.x + dx
        const y = center.y + dy
        if (!isParkingSpot(creep.room, x, y, creep)) continue
        const pos = new RoomPosition(x, y, center.roomName)
        if (!best || creep.pos.getRangeTo(pos) < creep.pos.getRangeTo(best)) best = pos
      }
    if (best) return best
  }
  return null
}
