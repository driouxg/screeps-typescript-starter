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
/**
 * Path reuse on the way to another room. Each search there spans the whole route (thousands of ops), and moveTo keeps
 * only the current room's part of the path anyway, so it searches again on entering each room; in between there's no
 * need to (creeps in the way are handled by the stuck checks, which search again straight away).
 */
const REUSE_PATH_CROSS_ROOM = 50
/** Path cost of our own construction sites for obstacle structures: walkable, but standing there blocks building. */
const OBSTACLE_SITE_COST = 10
/** How many creeps deep a tow may push through a packed crowd to clear its next tile. */
const SHOVE_DEPTH = 3
/** Ticks a tow may fail to advance before the puller paths around the crowd instead of through it. */
const TOW_REPATH_AFTER = 3
/**
 * Search budget for a path to another room: enough to finish a path across the few rooms routeRooms allows (moveTo
 * defaults to 2000), without letting an unreachable target burn a whole tick's CPU every time it repaths.
 */
const CROSS_ROOM_MAX_OPS = 6000
/** Search budget for planning a trip to another room (see travelRooms): once per trip, so it can afford to be wide. */
const TRAVEL_PLAN_MAX_OPS = 20000
const TRAVEL_PLAN_MAX_ROOMS = 16
/** After a trip couldn't be planned, fall back to the map route (see routeRooms) this long before trying again. */
const TRAVEL_RETRY_TICKS = 100
/** A trip planned at least this long ago is planned again when the creep gets stuck on it. */
const TRAVEL_REPLAN_AFTER = 50

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
    /** The rooms its path to another room crosses (see travelRooms); null rooms: couldn't be planned. */
    travel?: { to: string; rooms: string[] | null; tick: number }
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
    // Stuck on an old trip plan: the way may have closed (e.g. a wall built), so plan it again next time.
    const travel = creep.memory.travel
    if (travel && TRAVEL_REPLAN_AFTER <= Game.time - travel.tick) delete creep.memory.travel
    stepAside(creep)
    creep.memory.moveState!.stuck = 0
    return ERR_NO_PATH
  }

  if (0 < stuck && stuck < REPATH_AFTER) shoveBlocker(creep, pos, range)

  let rooms: Set<string> | null = null
  if (creep.room.name !== pos.roomName) rooms = travelRooms(creep, pos, range)
  else if (creep.memory.travel) delete creep.memory.travel
  return creep.moveTo(pos, {
    range,
    reusePath: stuck === 0 ? (rooms ? REUSE_PATH_CROSS_ROOM : REUSE_PATH) : 0,
    ignoreCreeps: stuck < REPATH_AFTER,
    ...(rooms ? { maxOps: CROSS_ROOM_MAX_OPS, maxRooms: Math.min(rooms.size, 64) } : {}),
    // Never route through a hostile room (see isHostileRoom) we aren't already in or headed for, nor (going to
    // another room) off the room route.
    costCallback: (roomName, matrix) =>
      (rooms && !rooms.has(roomName)) ||
      (roomName !== pos.roomName && roomName !== creep.room.name && isHostileRoom(roomName))
        ? blockedMatrix()
        : applyCreepCosts(roomName, matrix)
  })
}

/**
 * Rooms a creep may path through on its way to `pos` in another room: the rooms crossed by a path planned once per trip
 * (and again if it strays off them, changes destination, or gets stuck on an old plan), over terrain, structures we
 * can see, hostile rooms and keepers, but not creeps. The map route (see routeRooms) only knows that rooms share an
 * exit, not whether it can be reached: a room whose exit on that side is walled off inside it left creeps stuck
 * against the wall. Falls back to the map route while the trip can't be planned.
 */
function travelRooms(creep: Creep, pos: RoomPosition, range: number): Set<string> | null {
  const travel = creep.memory.travel
  if (travel?.to === pos.roomName) {
    if (travel.rooms?.includes(creep.room.name)) return new Set(travel.rooms)
    if (!travel.rooms && Game.time - travel.tick < TRAVEL_RETRY_TICKS) return routeRooms(creep.room.name, pos.roomName)
  }

  const rooms = planTravel(creep.pos, pos, range)
  creep.memory.travel = { to: pos.roomName, rooms, tick: Game.time }
  return rooms ? new Set(rooms) : routeRooms(creep.room.name, pos.roomName)
}

/** The rooms a path from `from` to within `range` of `pos` crosses, in order; null if there's no such path. */
function planTravel(from: RoomPosition, pos: RoomPosition, range: number): string[] | null {
  const result = PathFinder.search(
    from,
    { pos, range },
    {
      plainCost: 1,
      swampCost: 5,
      maxOps: TRAVEL_PLAN_MAX_OPS,
      maxRooms: TRAVEL_PLAN_MAX_ROOMS,
      roomCallback: roomName => {
        if (roomName !== pos.roomName && roomName !== from.roomName && isHostileRoom(roomName)) return false
        const matrix = new PathFinder.CostMatrix()
        for (const s of Game.rooms[roomName]?.find(FIND_STRUCTURES) ?? []) {
          if (s.structureType === STRUCTURE_ROAD) {
            if (matrix.get(s.pos.x, s.pos.y) === 0) matrix.set(s.pos.x, s.pos.y, 1)
          } else if (isObstacleStructure(s)) matrix.set(s.pos.x, s.pos.y, 0xff)
        }
        return applyKeeperCosts(roomName, matrix)
      }
    }
  )
  if (result.incomplete) return null
  return [...new Set([from.roomName, ...result.path.map(p => p.roomName)])]
}

/**
 * Rooms a creep going from `from` to `to` may path through: the room route (avoiding hostile rooms) plus its rooms'
 * direct neighbours, so the path can cut a corner. Without this, a cross-room moveTo searches the whole area, runs out
 * of ops, and walks a partial path toward whatever tile looked closest; repathing from there picks a different partial
 * path, and the creep walks back and forth. Cached per tick. Null when there's no route (then nothing is restricted).
 */
function routeRooms(from: string, to: string): Set<string> | null {
  if (routeCache.tick !== Game.time) routeCache = { tick: Game.time, routes: {} }
  const key = `${from}>${to}`
  if (key in routeCache.routes) return routeCache.routes[key]

  const route = Game.map.findRoute(from, to, {
    routeCallback: roomName => (roomName !== to && isHostileRoom(roomName) ? Infinity : 1)
  })
  let rooms: Set<string> | null = null
  if (route !== ERR_NO_PATH) {
    rooms = new Set([from, ...route.map(r => r.room)])
    for (const name of [...rooms])
      for (const exit of Object.values(Game.map.describeExits(name) ?? {}))
        if (exit && !isHostileRoom(exit)) rooms.add(exit)
  }
  routeCache.routes[key] = rooms
  return rooms
}
let routeCache: { tick: number; routes: { [key: string]: Set<string> | null } } = { tick: -1, routes: {} }

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
  if (!blocker || !canBeShoved(blocker) || 0 < blocker.fatigue || onExit(creep.pos)) return

  blocker.move(blocker.pos.getDirectionTo(creep))
}

/**
 * Whether a tile is on the room's edge. A creep swapped onto one is moved into the next room at the end of the tick,
 * and creeps that only work in their own room (pullers parked by the exit, say) never came back: so no swaps onto it.
 */
function onExit(pos: RoomPosition): boolean {
  return pos.x <= 0 || 49 <= pos.x || pos.y <= 0 || 49 <= pos.y
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
  if (!other || onExit(creep.pos)) return
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
