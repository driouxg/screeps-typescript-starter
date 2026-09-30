/**
 * Whether a creep can stand on (x, y) in `room`, now and after the room's planned buildings go up: inside the room,
 * not a wall, and no structure creeps can't walk through there, built, under construction or in the build order.
 * Our own and public ramparts, roads and containers are fine.
 */
export function isStandable(room: Room, x: number, y: number): boolean {
  if (x < 1 || 48 < x || y < 1 || 48 < y) return false
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false

  const blocks = (type: StructureConstant) => (OBSTACLE_OBJECT_TYPES as string[]).includes(type)
  const structures = room.lookForAt(LOOK_STRUCTURES, x, y)
  if (structures.some(s => (s instanceof StructureRampart ? !s.my && !s.isPublic : blocks(s.structureType))))
    return false
  if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).some(s => s.my && blocks(s.structureType))) return false

  return !plannedObstacles(room).has(x * 50 + y)
}

/** Tiles the build order puts a blocking structure on, cached per room per tick. */
let cache: { tick: number; byRoom: { [room: string]: Set<number> } } = { tick: -1, byRoom: {} }
function plannedObstacles(room: Room): Set<number> {
  if (cache.tick !== Game.time) cache = { tick: Game.time, byRoom: {} }
  if (!cache.byRoom[room.name])
    cache.byRoom[room.name] = new Set(
      (room.memory.buildOrder || [])
        .filter(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType))
        .map(s => s.x * 50 + s.y)
    )
  return cache.byRoom[room.name]
}
