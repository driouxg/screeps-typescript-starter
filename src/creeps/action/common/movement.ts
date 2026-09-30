import { applyKeeperCosts } from "utils/keeperZones"
import { blockedMatrix, isHostileRoom } from "utils/roomSafety"
/**
 * Goal: Move creeps without letting them get stuck.
 *
 * - Friendly creeps that can move are pathed through and shoved (swapped) out of the way when they block.
 * - Creeps that can't be shoved (not ours, or no MOVE parts, e.g. miners/upgraders) are treated as walls.
 * - A creep that hasn't moved for REPATH_AFTER ticks paths around all creeps instead of through them.
 * - A creep that hasn't moved for GIVE_UP_AFTER ticks steps onto any free tile and reports ERR_NO_PATH so
 *   the caller can pick a different target.
 */

const REPATH_AFTER = 2
const GIVE_UP_AFTER = 6
const REUSE_PATH = 5
/** Path cost of our own construction sites for obstacle structures: walkable, but standing there blocks building. */
const OBSTACLE_SITE_COST = 10
/** How many creeps deep a tow may push through a packed crowd to clear its next tile. */
const SHOVE_DEPTH = 3
/** Ticks a tow may fail to advance before the puller paths around the crowd instead of through it. */
const TOW_REPATH_AFTER = 3

interface MoveState {
  x: number
  y: number
  roomName: string
  tick: number
  stuck: number
}

declare global {
  interface CreepMemory {
    moveState?: MoveState
    /** Puller: where it was last tick while towing, and for how many ticks it hasn't advanced. */
    tow?: { key: string; tick: number; stuck: number }
    /** Tick this creep was moved aside for a tow; its own move that tick is skipped so it doesn't step back. */
    shovedTick?: number
    /** Works from a fixed spot (e.g. a rapid filler): treated as an obstacle, never shoved or parked. */
    stationary?: boolean
  }
}

export type MoveResult = CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND

export function smartMove(creep: Creep, target: RoomPosition | { pos: RoomPosition }, range = 1): MoveResult {
  const pos = target instanceof RoomPosition ? target : target.pos

  if (creep.spawning || creep.memory.shovedTick === Game.time) return ERR_BUSY
  if (creep.pos.roomName === pos.roomName && creep.pos.inRangeTo(pos, range)) {
    delete creep.memory.moveState
    return OK
  }
  if (creep.getActiveBodyparts(MOVE) === 0) return ERR_NO_BODYPART
  if (creep.fatigue > 0) return ERR_TIRED

  const stuck = updateStuckCount(creep)

  if (GIVE_UP_AFTER <= stuck) {
    stepAside(creep)
    creep.memory.moveState!.stuck = 0
    return ERR_NO_PATH
  }

  if (0 < stuck && stuck < REPATH_AFTER) shoveBlocker(creep, pos, range)

  return creep.moveTo(pos, {
    range,
    reusePath: stuck === 0 ? REUSE_PATH : 0,
    ignoreCreeps: stuck < REPATH_AFTER,
    // Never route through a hostile room (see isHostileRoom) we aren't already in or headed for.
    costCallback: (roomName, matrix) =>
      roomName !== pos.roomName && roomName !== creep.room.name && isHostileRoom(roomName)
        ? blockedMatrix()
        : applyCreepCosts(roomName, matrix)
  })
}

/**
 * Pull `target` (a creep without MOVE parts) to `dest`: walk to it, then tow it there. Call once per tick.
 *
 * Towing can't use smartMove's shove: that swaps the blocker into the puller's tile, which is exactly where the
 * towed creep needs to step, so the puller and blocker would swap back and forth forever. Instead the blocker is
 * moved aside onto a tile off the train (shoving its own neighbours, up to SHOVE_DEPTH deep, if the crowd is
 * packed). If the train still hasn't moved after TOW_REPATH_AFTER ticks, the puller paths around the crowd.
 */
export function pullTo(puller: Creep, target: Creep, dest: RoomPosition): void {
  if (target.pos.isEqualTo(dest)) {
    delete puller.memory.tow
    return
  }

  if (puller.pull(target) === ERR_NOT_IN_RANGE) {
    delete puller.memory.tow
    smartMove(puller, target, 1)
    return
  }
  if (puller.fatigue > 0) return

  if (puller.pos.isEqualTo(dest)) {
    // Step back onto the towed creep's tile while it's pulled forward onto ours.
    puller.move(puller.pos.getDirectionTo(target))
    target.move(puller) // a creep without MOVE parts can only move by following its puller
    return
  }

  const stuck = updateTowStuck(puller)
  const path = towPath(puller, target, dest, TOW_REPATH_AFTER <= stuck)
  if (path.length <= 0) return

  const next = new RoomPosition(path[0].x, path[0].y, puller.room.name)
  const blocker = next.lookFor(LOOK_CREEPS)[0]
  if (blocker) {
    const train = new Set([tileKey(puller.pos), tileKey(target.pos)])
    const ahead = new Set(path.slice(1, 4).map(p => `${p.x},${p.y}`))
    // Prefer moving the blocker somewhere that isn't further along our path, so it doesn't block us again.
    const cleared =
      makeRoom(blocker, new Set([...train, ...ahead]), SHOVE_DEPTH) || makeRoom(blocker, train, SHOVE_DEPTH)
    if (!cleared) return // wait; after TOW_REPATH_AFTER ticks we path around instead
  }

  puller.move(puller.pos.getDirectionTo(next))
  target.move(puller)
}

/** Tow path to dest. Normally straight through creeps we can move aside; around every creep once stuck. */
function towPath(puller: Creep, target: Creep, dest: RoomPosition, avoidCreeps: boolean): PathStep[] {
  return puller.pos.findPathTo(dest, {
    range: 0,
    ignoreCreeps: !avoidCreeps,
    maxOps: 2000,
    costCallback: (roomName, matrix) => {
      applyCreepCosts(roomName, matrix)
      matrix.set(target.pos.x, target.pos.y, 0xff) // don't path back through the train
      return matrix
    }
  })
}

function updateTowStuck(puller: Creep): number {
  const key = tileKey(puller.pos)
  const prev = puller.memory.tow
  const stuck = prev && prev.key === key && prev.tick === Game.time - 1 ? prev.stuck + 1 : 0
  puller.memory.tow = { key, tick: Game.time, stuck }
  return stuck
}

/**
 * Move `creep` onto a free neighbouring tile that isn't in `avoid`. If every such tile has a creep on it, first
 * make room for one of those (recursively, `depth` more creeps deep) and move into the tile it leaves.
 * Returns whether a move was issued.
 */
function makeRoom(creep: Creep, avoid: Set<string>, depth: number): boolean {
  if (!canBeShoved(creep) || 0 < creep.fatigue || creep.memory.shovedTick === Game.time) return false

  const terrain = creep.room.getTerrain()
  const candidates: RoomPosition[] = []
  for (const direction of shuffledDirections()) {
    const [dx, dy] = DIRECTION_OFFSETS[direction]
    const x = creep.pos.x + dx
    const y = creep.pos.y + dy
    if (x < 1 || 48 < x || y < 1 || 48 < y || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
    if (avoid.has(`${x},${y}`) || claimedThisTick().has(`${x},${y}`)) continue
    if (creep.room.lookForAt(LOOK_STRUCTURES, x, y).some(isObstacleStructure)) continue
    candidates.push(new RoomPosition(x, y, creep.room.name))
  }

  const occupant = (pos: RoomPosition) => pos.lookFor(LOOK_CREEPS)[0] || pos.lookFor(LOOK_POWER_CREEPS)[0]

  const free = candidates.find(pos => !occupant(pos))
  if (free) return moveShoved(creep, free)
  if (depth <= 0) return false

  const deeper = new Set(avoid).add(tileKey(creep.pos))
  for (const pos of candidates) {
    const other = occupant(pos)
    if (other instanceof Creep && makeRoom(other, deeper, depth - 1)) return moveShoved(creep, pos)
  }
  return false
}

function moveShoved(creep: Creep, pos: RoomPosition): boolean {
  creep.move(creep.pos.getDirectionTo(pos))
  creep.memory.shovedTick = Game.time
  claimedThisTick().add(tileKey(pos))
  return true
}

/** Tiles a shoved creep is moving onto this tick, so two shoves don't pick the same tile. */
let claimed: { tick: number; tiles: Set<string> } = { tick: -1, tiles: new Set() }
function claimedThisTick(): Set<string> {
  if (claimed.tick !== Game.time) claimed = { tick: Game.time, tiles: new Set() }
  return claimed.tiles
}

function tileKey(pos: RoomPosition): string {
  return `${pos.x},${pos.y}`
}

/**
 * Mark tiles creeps shouldn't path through: creeps we can't shove, and our own construction sites for obstacle
 * structures (a creep standing on one stops it from being built).
 */
export function applyCreepCosts(roomName: string, matrix: CostMatrix): CostMatrix {
  // Source keepers: stay out of their reach (works without vision, from intel).
  applyKeeperCosts(roomName, matrix)

  const room = Game.rooms[roomName]
  if (!room) return matrix

  for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
    if (isObstacleType(site.structureType) && matrix.get(site.pos.x, site.pos.y) < OBSTACLE_SITE_COST)
      matrix.set(site.pos.x, site.pos.y, OBSTACLE_SITE_COST)
  }
  for (const other of room.find(FIND_CREEPS)) {
    if (!canBeShoved(other)) matrix.set(other.pos.x, other.pos.y, 0xff)
  }
  for (const other of room.find(FIND_POWER_CREEPS)) {
    if (!other.my) matrix.set(other.pos.x, other.pos.y, 0xff)
  }

  return matrix
}

/**
 * Move off the given tile if standing on it, e.g. so a construction site underneath can be built.
 */
export function moveOffTile(creep: Creep, pos: RoomPosition): void {
  if (creep.pos.isEqualTo(pos)) stepAside(creep)
}

/**
 * Ask a friendly creep standing on `pos` to move to any free adjacent tile.
 */
export function clearTile(pos: RoomPosition): void {
  const blocker = pos.lookFor(LOOK_CREEPS)[0]
  if (blocker && canBeShoved(blocker) && blocker.fatigue === 0) stepAside(blocker)
}

function canBeShoved(creep: Creep): boolean {
  return creep.my && !creep.spawning && !creep.memory.stationary && 0 < creep.getActiveBodyparts(MOVE)
}

function updateStuckCount(creep: Creep): number {
  const prev = creep.memory.moveState
  const { x, y, roomName } = creep.pos
  const didntMove = prev !== undefined && prev.x === x && prev.y === y && prev.roomName === roomName
  const triedLastTick = prev !== undefined && prev.tick === Game.time - 1
  const stuck = didntMove && triedLastTick ? prev!.stuck + 1 : 0

  creep.memory.moveState = { x, y, roomName, tick: Game.time, stuck }
  return stuck
}

/**
 * Swap places with a friendly creep that's on the next tile of our path.
 */
function shoveBlocker(creep: Creep, pos: RoomPosition, range: number): void {
  const path = creep.pos.findPathTo(pos, {
    range,
    ignoreCreeps: true,
    maxOps: 1000,
    costCallback: (roomName, matrix) => applyCreepCosts(roomName, matrix)
  })
  if (path.length <= 0) return

  const blocker = creep.room.lookForAt(LOOK_CREEPS, path[0].x, path[0].y)[0]
  if (!blocker || !canBeShoved(blocker) || 0 < blocker.fatigue) return

  blocker.move(blocker.pos.getDirectionTo(creep))
}

/**
 * Step onto any free adjacent tile, or swap with a friendly creep if every tile is taken. When a creep is boxed in
 * by walls, structures and creeps that can't be shoved, there's nothing to do but wait.
 */
function stepAside(creep: Creep): void {
  const terrain = creep.room.getTerrain()
  const swappable: Creep[] = []

  for (const direction of shuffledDirections()) {
    const [dx, dy] = DIRECTION_OFFSETS[direction]
    const x = creep.pos.x + dx
    const y = creep.pos.y + dy
    // Stay off the room edge so we don't bounce into the next room.
    if (x < 1 || 48 < x || y < 1 || 48 < y || terrain.get(x, y) === TERRAIN_MASK_WALL) continue

    const structures = creep.room.lookForAt(LOOK_STRUCTURES, x, y)
    if (structures.some(isObstacleStructure)) continue

    const occupant = creep.room.lookForAt(LOOK_CREEPS, x, y)[0] || creep.room.lookForAt(LOOK_POWER_CREEPS, x, y)[0]
    if (!occupant) {
      creep.move(direction)
      return
    }
    if (occupant instanceof Creep && canBeShoved(occupant) && occupant.fatigue === 0) swappable.push(occupant)
  }

  const other = swappable[0]
  if (!other) return
  creep.move(creep.pos.getDirectionTo(other))
  other.move(other.pos.getDirectionTo(creep))
}

function isObstacleType(structureType: StructureConstant): boolean {
  return (OBSTACLE_OBJECT_TYPES as string[]).includes(structureType)
}

function isObstacleStructure(structure: Structure): boolean {
  if (structure instanceof StructureRampart) return !structure.my && !structure.isPublic
  return isObstacleType(structure.structureType)
}

function shuffledDirections(): DirectionConstant[] {
  return ([TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT] as DirectionConstant[]).sort(
    () => Math.random() - 0.5
  )
}

const DIRECTION_OFFSETS: Record<DirectionConstant, [number, number]> = {
  [TOP]: [0, -1],
  [TOP_RIGHT]: [1, -1],
  [RIGHT]: [1, 0],
  [BOTTOM_RIGHT]: [1, 1],
  [BOTTOM]: [0, 1],
  [BOTTOM_LEFT]: [-1, 1],
  [LEFT]: [-1, 0],
  [TOP_LEFT]: [-1, -1]
}
