/**
 * Goal: Know when a base's own roads are built, so the creeps working in it (haulers, builders) can be spawned with
 * half the MOVE they'd need off-road: on roads, 1 MOVE carries 2 other parts at a tile per tick.
 */

/** Share of the base's planned roads that must be built for its creeps to be built for roads. */
const ROADS_BUILT_SHARE = 0.8
/** How often the base's roads are counted. */
const CHECK_TICKS = 100

const cache = new Map<string, { tick: number; share: number }>()

/** Whether the base's roads are mostly built (ROADS_BUILT_SHARE of the planned ones, see roadsBuiltShare). */
export function baseRoadsBuilt(room: Room): boolean {
  return ROADS_BUILT_SHARE <= roadsBuiltShare(room)
}

/**
 * Share of the base's planned roads (its build order's, but not tunnels through walls, which come late) that are
 * built. Counted every CHECK_TICKS.
 */
export function roadsBuiltShare(room: Room): number {
  const cached = cache.get(room.name)
  if (cached && Game.time - cached.tick < CHECK_TICKS) return cached.share

  const terrain = room.getTerrain()
  const planned = (room.memory.buildOrder ?? []).filter(
    s => s.structureType === STRUCTURE_ROAD && terrain.get(s.x, s.y) !== TERRAIN_MASK_WALL
  )
  const roads = new Set(
    room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD }).map(s => s.pos.x * 50 + s.pos.y)
  )
  const built = planned.filter(s => roads.has(s.x * 50 + s.y)).length
  const share = planned.length ? built / planned.length : 0
  cache.set(room.name, { tick: Game.time, share })
  return share
}
