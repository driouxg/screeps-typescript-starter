import { isHostile } from "config/relations"
/**
 * Goal: Remember what we've seen of each room, so expansion can pick a target without vision of every candidate.
 *
 * Stored in Memory.rooms[name].intel whenever we have vision of a room (scouts, remote miners, owned rooms).
 * Terrain ratios come from Game.map.getRoomTerrain, which works without vision.
 */

export interface RoomIntel {
  tick: number
  sources: number
  /** Average range from the controller to the sources. */
  controllerToSources: number
  controller?: { x: number; y: number; owner?: string; reservedBy?: string; level: number }
  /** Hostile towers, spawns and invader cores: a room we'd have to take by force. */
  hostileStructures: number
  /** Hostile creeps that can fight, when last seen. */
  hostileFighters: number
  swampRatio: number
  wallRatio: number
  /** Source positions, for remote mining without vision. */
  sourcePositions?: { id: string; x: number; y: number }[]
  /** Source keeper lairs: keepers guard the sources and attack anything nearby. */
  keeperLairs?: number
}

declare global {
  interface RoomMemory {
    intel?: RoomIntel
  }
}

/** Refresh intel for a visible room at most this often. */
const REFRESH_TICKS = 100

export function recordIntel(room: Room, force = false): void {
  const previous = room.memory.intel
  if (!force && previous && Game.time - previous.tick < REFRESH_TICKS) return

  const sources = room.find(FIND_SOURCES)
  const controller = room.controller
  const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_TOWER ||
      s.structureType === STRUCTURE_SPAWN ||
      s.structureType === STRUCTURE_INVADER_CORE
  }).length
  const hostileFighters = room.find(FIND_HOSTILE_CREEPS, {
    filter: c => isHostile(c) && (0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK))
  }).length

  room.memory.intel = {
    tick: Game.time,
    sources: sources.length,
    controllerToSources: controller
      ? sources.reduce((sum, s) => sum + controller.pos.getRangeTo(s), 0) / Math.max(1, sources.length)
      : 0,
    controller: controller
      ? {
          x: controller.pos.x,
          y: controller.pos.y,
          owner: controller.owner?.username,
          reservedBy: controller.reservation?.username,
          level: controller.level
        }
      : undefined,
    hostileStructures,
    sourcePositions: sources.map(s => ({ id: s.id as string, x: s.pos.x, y: s.pos.y })),
    keeperLairs: room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_KEEPER_LAIR }).length,
    hostileFighters,
    ...terrainRatios(room.name)
  }
}

function terrainRatios(roomName: string): { swampRatio: number; wallRatio: number } {
  const terrain = Game.map.getRoomTerrain(roomName)
  let swamp = 0
  let wall = 0
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const t = terrain.get(x, y)
      if (t === TERRAIN_MASK_WALL) wall++
      else if (t === TERRAIN_MASK_SWAMP) swamp++
    }
  }
  return { swampRatio: swamp / 2500, wallRatio: wall / 2500 }
}
