import { smartMove } from "./movement"

/**
 * Goal: Give idle creeps somewhere to wait that's out of everyone's way.
 *
 * A parking spot is open ground at least PARK_RANGE_FROM_BUSY from spawns, sources and the controller, and not on
 * a road, container, construction site or any tile the build order plans to build on. The spot is remembered, so
 * a parked creep doesn't search again every tick.
 */

const PARK_RANGE_FROM_BUSY = 3
const SEARCH_RADIUS = 10
/** Creeps that stand still next to a spawn this long, without moving or using energy, get parked. */
const LOITER_TICKS = 5

declare global {
  interface CreepMemory {
    parkPos?: { x: number; y: number; roomName: string }
    /** Tile and carried energy when first seen standing next to a spawn, to detect loitering. */
    loiter?: { key: string; since: number }
    /** Loitered next to a spawn and is being moved away until PARK_RANGE_FROM_BUSY from it. */
    evicted?: boolean
  }
}

export function park(creep: Creep): void {
  const saved = creep.memory.parkPos
  let pos = saved && saved.roomName === creep.room.name ? new RoomPosition(saved.x, saved.y, saved.roomName) : undefined

  if (!pos || !isParkingSpot(creep.room, pos.x, pos.y, creep)) {
    pos = findParkingSpot(creep) ?? undefined
    creep.memory.parkPos = pos ? { x: pos.x, y: pos.y, roomName: pos.roomName } : undefined
  }
  if (pos && !creep.pos.isEqualTo(pos)) smartMove(creep, pos, 0)
}

/** Forget the parking spot once the creep has work again. */
export function unpark(creep: Creep): void {
  delete creep.memory.parkPos
}

/**
 * Safety net for idle creeps a role handler left next to a spawn: park any that have stood on the same tile with
 * the same energy for LOITER_TICKS, and keep moving them until they're PARK_RANGE_FROM_BUSY away (half-moved
 * creeps would otherwise ring the spawn and trap the ones behind them). After that their role takes over again.
 * Creeps without MOVE parts can't move and are left for the puller.
 */
export function clearLoiterersFromSpawns(): void {
  for (const name in Game.spawns) {
    const spawn = Game.spawns[name]
    for (const creep of spawn.pos.findInRange(FIND_MY_CREEPS, 1)) {
      if (creep.spawning || creep.memory.stationary || creep.getActiveBodyparts(MOVE) === 0) continue

      const key = `${creep.pos.x},${creep.pos.y},${creep.store.getUsedCapacity()}`
      if (creep.memory.loiter?.key !== key) creep.memory.loiter = { key, since: Game.time }
      if (LOITER_TICKS <= Game.time - creep.memory.loiter.since) creep.memory.evicted = true
    }
  }

  for (const name in Game.creeps) {
    const creep = Game.creeps[name]
    if (!creep.memory.evicted) continue

    const spawns = creep.room.find(FIND_MY_SPAWNS)
    if (spawns.every(s => !creep.pos.inRangeTo(s, PARK_RANGE_FROM_BUSY - 1))) {
      delete creep.memory.evicted
      delete creep.memory.loiter
      continue
    }
    if (creep.fatigue === 0) park(creep)
  }
}

function findParkingSpot(creep: Creep): RoomPosition | null {
  const { x: cx, y: cy } = creep.pos
  for (let r = 1; r <= SEARCH_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring only
        if (isParkingSpot(creep.room, cx + dx, cy + dy, creep))
          return new RoomPosition(cx + dx, cy + dy, creep.room.name)
      }
    }
  }
  return null
}

export function isParkingSpot(room: Room, x: number, y: number, creep: Creep): boolean {
  if (x < 2 || 47 < x || y < 2 || 47 < y) return false
  if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) return false
  if (plannedTiles(room).has(x * 50 + y)) return false

  const pos = new RoomPosition(x, y, room.name)
  const busy = [
    ...room.find(FIND_MY_SPAWNS).map(s => s.pos),
    ...room.find(FIND_SOURCES).map(s => s.pos),
    ...(room.controller ? [room.controller.pos] : [])
  ]
  if (busy.some(b => pos.inRangeTo(b, PARK_RANGE_FROM_BUSY - 1))) return false

  if (0 < pos.lookFor(LOOK_STRUCTURES).length || 0 < pos.lookFor(LOOK_CONSTRUCTION_SITES).length) return false
  const occupant = pos.lookFor(LOOK_CREEPS)[0]
  return !occupant || occupant.id === creep.id
}

/** Tiles the build order will build on, cached per room per tick. (Typed locally so this module compiles alone.) */
let plannedCache: { tick: number; byRoom: { [room: string]: Set<number> } } = { tick: -1, byRoom: {} }
function plannedTiles(room: Room): Set<number> {
  if (plannedCache.tick !== Game.time) plannedCache = { tick: Game.time, byRoom: {} }
  if (!plannedCache.byRoom[room.name])
    plannedCache.byRoom[room.name] = new Set(
      ((room.memory as { buildOrder?: { x: number; y: number }[] }).buildOrder || []).map(s => s.x * 50 + s.y)
    )
  return plannedCache.byRoom[room.name]
}
