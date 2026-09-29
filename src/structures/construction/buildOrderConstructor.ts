/**
 * Goal: Build structures in a defined order for efficiency.
 *
 * Keeps up to MAX_OPEN_SITES construction sites open so builders always have work, placing the highest priority
 * steps first (buildOrder index breaks ties). Steps that can't be placed (blocked tile, not allowed at this RCL)
 * are skipped rather than waited on, so one bad step can't stall the whole order.
 *
 * room.memory.buildCursor is the index of the first step not yet built, so it reaches buildOrder.length once
 * everything is built.
 */
const MAX_OPEN_SITES = 5
const PLACE_INTERVAL = 5

/** Lower builds first. Anything unlisted builds after roads. */
const PRIORITY: Partial<Record<BuildableStructureConstant, number>> = {
  [STRUCTURE_SPAWN]: 0,
  [STRUCTURE_EXTENSION]: 1,
  [STRUCTURE_TOWER]: 2,
  [STRUCTURE_STORAGE]: 4,
  [STRUCTURE_CONTAINER]: 5,
  [STRUCTURE_LINK]: 6,
  [STRUCTURE_TERMINAL]: 7,
  [STRUCTURE_EXTRACTOR]: 8,
  [STRUCTURE_LAB]: 8,
  [STRUCTURE_FACTORY]: 9,
  [STRUCTURE_POWER_SPAWN]: 9,
  [STRUCTURE_OBSERVER]: 9,
  [STRUCTURE_NUKER]: 9,
  [STRUCTURE_ROAD]: 10,
  [STRUCTURE_RAMPART]: 11,
  [STRUCTURE_WALL]: 12
}
/** Containers next to sources and the controller feed miners and upgraders, so they come before storage. */
const RESOURCE_CONTAINER_PRIORITY = 3

export default function build(room: Room) {
  const buildOrder = room.memory.buildOrder
  if (!buildOrder || buildOrder.length <= 0 || !room.controller?.my) return
  if (Game.time % PLACE_INTERVAL !== 0) return

  const key = (x: number, y: number, type: string) => `${x},${y},${type}`
  const built = new Set(room.find(FIND_STRUCTURES).map(s => key(s.pos.x, s.pos.y, s.structureType)))
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES)
  const hasSite = new Set(sites.map(s => key(s.pos.x, s.pos.y, s.structureType)))

  // Structures of each type we have or are building, to skip steps the RCL doesn't allow yet.
  const counts: { [type: string]: number } = {}
  for (const s of room.find(FIND_MY_STRUCTURES)) counts[s.structureType] = (counts[s.structureType] || 0) + 1
  for (const s of room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER }))
    counts[s.structureType] = (counts[s.structureType] || 0) + 1
  for (const s of sites) counts[s.structureType] = (counts[s.structureType] || 0) + 1

  const pending: { step: BuildOrderStep; index: number; priority: number }[] = []
  let firstUnbuilt = buildOrder.length
  buildOrder.forEach((step, index) => {
    if (built.has(key(step.x, step.y, step.structureType))) return
    firstUnbuilt = Math.min(firstUnbuilt, index)
    if (hasSite.has(key(step.x, step.y, step.structureType))) return
    const pos = new RoomPosition(step.x, step.y, room.name)
    pending.push({ step, index, priority: priorityOf(room, pos, step.structureType) })
  })
  room.memory.buildCursor = firstUnbuilt

  let open = sites.length
  // Unstarted sites that a higher priority step may replace when every slot is taken, lowest priority first.
  const evictable = sites
    .filter(s => s.progress === 0)
    .map(site => ({ site, priority: priorityOf(room, site.pos, site.structureType) }))
    .sort((a, b) => b.priority - a.priority)

  const terrain = room.getTerrain()
  pending.sort((a, b) => a.priority - b.priority || a.index - b.index)

  for (const { step, priority } of pending) {
    const allowed = CONTROLLER_STRUCTURES[step.structureType]?.[room.controller.level] ?? 0
    if (allowed <= (counts[step.structureType] || 0)) continue
    if (!isPlaceable(step, terrain)) continue

    if (MAX_OPEN_SITES <= open) {
      const victim = evictable[0]
      if (!victim || victim.priority <= priority) break
      evictable.shift()
      victim.site.remove()
      open--
      counts[victim.site.structureType] = (counts[victim.site.structureType] || 1) - 1
    }

    const code = room.createConstructionSite(step.x, step.y, step.structureType)
    if (code === OK) {
      open++
      counts[step.structureType] = (counts[step.structureType] || 0) + 1
    } else if (code === ERR_FULL) break
    // Anything else (tile blocked by another structure, etc.): skip it and try the next step.
  }
}

/**
 * Build priority of a structure at pos; lower builds first. Builders use it too, so they work on sites in the
 * same order they're placed.
 */
export function priorityOf(room: Room, pos: RoomPosition, structureType: StructureConstant): number {
  if (structureType === STRUCTURE_CONTAINER && feedsMinersOrUpgraders(room, pos)) return RESOURCE_CONTAINER_PRIORITY
  return PRIORITY[structureType as BuildableStructureConstant] ?? PRIORITY[STRUCTURE_ROAD]! + 0.5
}

function feedsMinersOrUpgraders(room: Room, pos: RoomPosition): boolean {
  if (room.controller && pos.inRangeTo(room.controller.pos, 2)) return true
  return room.find(FIND_SOURCES).some(s => pos.isNearTo(s.pos))
}

function isPlaceable(step: BuildOrderStep, terrain: RoomTerrain): boolean {
  if (step.x < 1 || 48 < step.x || step.y < 1 || 48 < step.y) return false
  // Roads can be built on walls (tunnels); nothing else can.
  return step.structureType === STRUCTURE_ROAD || terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL
}
