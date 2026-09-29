/**
 * Pick a tile for a miner next to `source`: the planned container spot first (energy dropped there lands in the
 * container once it's built), then any other open tile next to the source that none of `miners` (alive or dying)
 * has claimed or is standing on, and nothing is planned to be built on.
 */
export function freeMiningPosition(room: Room, source: Source, miners: Creep[]): RoomPosition | null {
  const claimed = (x: number, y: number) =>
    miners.some(m => {
      const p = (m.memory as { targetSourcePos?: RoomPositionJson }).targetSourcePos
      return (p && p.x === x && p.y === y) || (m.pos.x === x && m.pos.y === y)
    })

  const container = (room.memory.minerPositions || []).find(p => p.sourceId === source.id)
  if (container && !claimed(container.pos.x, container.pos.y))
    return new RoomPosition(container.pos.x, container.pos.y, room.name)

  const terrain = room.getTerrain()
  const planned = new Set(
    (room.memory.buildOrder || [])
      .filter(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType))
      .map(s => `${s.x},${s.y}`)
  )
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = source.pos.x + dx
      const y = source.pos.y + dy
      if ((dx === 0 && dy === 0) || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      if (planned.has(`${x},${y}`) || claimed(x, y)) continue
      return new RoomPosition(x, y, room.name)
    }
  }
  return null
}
