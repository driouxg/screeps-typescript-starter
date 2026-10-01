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
/** Nothing but a spawn gets built before this RCL (see build). */
const MIN_BUILD_RCL = 2

/**
 * Build priority, lower first. Each structure only becomes buildable at the RCL the game allows it, so this one
 * table gives the order within every RCL:
 *
 * - RCL 2: extensions (spawn capacity means bigger creeps), then containers at sources and the controller (stop
 *   dropped energy decaying), then roads.
 * - RCL 3: a tower first (defence; it also repairs and heals), then the new extensions.
 * - RCL 4: storage right after extensions, to bank surplus. RCL 5: links. RCL 6+: terminal, extractor, labs, ...
 *
 * Roads come after everything else: they cost upkeep and matter less than capacity and defence. Ramparts and walls
 * wait for a tower (see NEEDS_TOWER).
 */
const PRIORITY: Partial<Record<BuildableStructureConstant, number>> = {
  [STRUCTURE_SPAWN]: 0,
  [STRUCTURE_TOWER]: 1,
  [STRUCTURE_EXTENSION]: 2,
  [STRUCTURE_STORAGE]: 4,
  [STRUCTURE_LINK]: 5,
  [STRUCTURE_TERMINAL]: 6,
  [STRUCTURE_EXTRACTOR]: 6,
  [STRUCTURE_LAB]: 7,
  [STRUCTURE_FACTORY]: 8,
  [STRUCTURE_POWER_SPAWN]: 8,
  [STRUCTURE_OBSERVER]: 8,
  [STRUCTURE_NUKER]: 8,
  [STRUCTURE_CONTAINER]: 8.5,
  [STRUCTURE_ROAD]: 9,
  [STRUCTURE_RAMPART]: 10,
  [STRUCTURE_WALL]: 11
}
/**
 * Roads on wall tiles (tunnels) cost CONSTRUCTION_COST_ROAD_WALL_RATIO (150) times a normal road, 45000 energy, so
 * they're built after everything else, and not before TUNNEL_MIN_RCL.
 */
const TUNNEL_PRIORITY = 12
/** Before this RCL tunnels aren't built at all: the energy is worth far more in the economy. */
export const TUNNEL_MIN_RCL = 7
/** Containers next to sources and the controller feed miners and upgraders, so they come right after extensions. */
const RESOURCE_CONTAINER_PRIORITY = 3
/**
 * Not worth building until a tower can maintain them: a rampart is built with 1 hit and decays away in about 100
 * ticks unless something keeps repairing it.
 */
const NEEDS_TOWER: StructureConstant[] = [STRUCTURE_RAMPART, STRUCTURE_WALL]

export default function build(room: Room) {
  const buildOrder = room.memory.buildOrder
  if (!buildOrder || buildOrder.length <= 0 || !room.controller?.my) return
  if (Game.time % PLACE_INTERVAL !== 0) return

  const key = (x: number, y: number, type: string) => `${x},${y},${type}`
  const built = new Set(room.find(FIND_STRUCTURES).map(s => key(s.pos.x, s.pos.y, s.structureType)))
  let sites = room.find(FIND_MY_CONSTRUCTION_SITES)
  // Tunnel sites placed before TUNNEL_MIN_RCL (by older code) would hold a slot nobody builds: drop the unstarted ones.
  if (!tunnelsAllowed(room)) {
    for (const s of sites) if (s.progress === 0 && isTunnel(room, s.pos, s.structureType)) s.remove()
    sites = sites.filter(s => s.progress !== 0 || !isTunnel(room, s.pos, s.structureType))
  }
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
  const hasTower = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length > 0
  pending.sort((a, b) => a.priority - b.priority || a.index - b.index)

  for (const { step, priority } of pending) {
    // At RCL 1 every bit of energy should go into the controller (RCL 2 needs only 200): the only things buildable
    // then are containers (5000 energy each) and roads, which would push RCL 2 back by hundreds of ticks.
    if (room.controller.level < MIN_BUILD_RCL && step.structureType !== STRUCTURE_SPAWN) continue
    if (!tunnelsAllowed(room) && isTunnel(room, new RoomPosition(step.x, step.y, room.name), step.structureType))
      continue
    const allowed = CONTROLLER_STRUCTURES[step.structureType]?.[room.controller.level] ?? 0
    if (allowed <= (counts[step.structureType] || 0)) continue
    if (!isPlaceable(step, terrain)) continue
    if (!hasTower && NEEDS_TOWER.includes(step.structureType)) continue

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
  if (isTunnel(room, pos, structureType)) return TUNNEL_PRIORITY
  if (structureType === STRUCTURE_CONTAINER && feedsMinersOrUpgraders(room, pos)) return RESOURCE_CONTAINER_PRIORITY
  return PRIORITY[structureType as BuildableStructureConstant] ?? PRIORITY[STRUCTURE_ROAD]! + 0.5
}

/** A road on a wall tile: 150 times the cost of a normal road. */
export function isTunnel(room: Room, pos: RoomPosition, structureType: StructureConstant): boolean {
  return structureType === STRUCTURE_ROAD && room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL
}

/** Whether the room is far enough along to build tunnels (see TUNNEL_MIN_RCL). */
export function tunnelsAllowed(room: Room): boolean {
  return TUNNEL_MIN_RCL <= (room.controller?.level ?? 0)
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
