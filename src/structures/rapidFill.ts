/**
 * Geometry of a room's rapid fill stamp (see StampLayoutHandler): containers 2 either side of a central link, and
 * four filler spots on the link's diagonals. Each spot touches a container, the link, and the spawns and extensions
 * around it, so a filler standing there can refill them all without moving.
 */

declare global {
  interface RoomMemory {
    /** Centre of the rapid fill stamp; set by the planner, or found in the build order for older plans. */
    rapidFill?: { x: number; y: number } | null
  }
}

export interface RapidFill {
  center: RoomPosition
  spots: RoomPosition[]
  containers: RoomPosition[]
  link: RoomPosition
}

export function rapidFillOf(room: Room): RapidFill | null {
  if (room.memory.rapidFill === undefined) room.memory.rapidFill = findInBuildOrder(room)
  const c = room.memory.rapidFill
  if (!c) return null

  const at = (dx: number, dy: number) => new RoomPosition(c.x + dx, c.y + dy, room.name)
  const horizontal = containerAt(room, c.x - 2, c.y) || containerAt(room, c.x + 2, c.y)
  return {
    center: at(0, 0),
    spots: [at(-1, -1), at(1, -1), at(-1, 1), at(1, 1)],
    containers: horizontal ? [at(-2, 0), at(2, 0)] : [at(0, -2), at(0, 2)],
    link: at(0, 0)
  }
}

/** Centre = the planned link with a planned container 2 tiles either side of it (horizontally or vertically). */
function findInBuildOrder(room: Room): { x: number; y: number } | null {
  const order = room.memory.buildOrder || []
  const has = (x: number, y: number, type: StructureConstant) =>
    order.some(s => s.x === x && s.y === y && s.structureType === type)
  for (const link of order.filter(s => s.structureType === STRUCTURE_LINK)) {
    const { x, y } = link
    if (
      (has(x - 2, y, STRUCTURE_CONTAINER) && has(x + 2, y, STRUCTURE_CONTAINER)) ||
      (has(x, y - 2, STRUCTURE_CONTAINER) && has(x, y + 2, STRUCTURE_CONTAINER))
    )
      return { x, y }
  }
  return null
}

function containerAt(room: Room, x: number, y: number): boolean {
  return (room.memory.buildOrder || []).some(s => s.x === x && s.y === y && s.structureType === STRUCTURE_CONTAINER)
}
