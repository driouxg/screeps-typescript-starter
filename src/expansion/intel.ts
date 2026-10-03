import { keeperPosts } from "utils/keeperZones"
import { isHostile } from "config/relations"
import { recordSiege } from "conquest/siegeIntel"
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
  /** Keeper lairs and the resources they guard, so paths can keep out of keepers' reach without vision. */
  keeperPosts?: { x: number; y: number }[]
  /** Another player's base: its towers and the energy in them, and safe mode (see defence/retaliation). */
  towers?: number
  towerEnergy?: number
  /** Tick its safe mode ends (when it was on), and charges it had left. */
  safeModeUntil?: number
  safeModeAvailable?: number
  /** Another player's base: energy in its storage and terminal (see defence/strength). */
  storedEnergy?: number
  /**
   * Another player's base: its stored energy at an earlier look, at least TREND_TICKS before this one where we have
   * one, so the conquest assessment can tell a stockpile being filled (from remotes, or by terminal from their other
   * bases) from one being spent.
   */
  storedBefore?: { energy: number; tick: number }
  /** Another player's base has a terminal: it can be sent energy from their other bases. */
  terminal?: boolean
  /** Other players' creeps seen here: their ATTACK, RANGED_ATTACK and HEAL parts, by player (see defence/strength). */
  combatParts?: { [username: string]: number }
}

declare global {
  interface RoomMemory {
    intel?: RoomIntel
  }
}

/** Refresh intel for a visible room at most this often. */
const REFRESH_TICKS = 100
/** The earlier look storedBefore keeps is at least this old, so a trend isn't just one refill. */
const TREND_TICKS = 1000

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
  const towers = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  }) as StructureTower[]
  const hostileFighters = room.find(FIND_HOSTILE_CREEPS, {
    filter: c => isHostile(c) && (0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK))
  }).length

  const theirs = !!controller?.owner && !controller.my
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
    keeperPosts: keeperPosts(room),
    hostileFighters,
    towers: towers.length,
    towerEnergy: towers.reduce((sum, t) => sum + t.store.energy, 0),
    safeModeUntil: controller?.safeMode ? Game.time + controller.safeMode : undefined,
    safeModeAvailable: controller?.owner ? controller.safeModeAvailable : undefined,
    storedEnergy: theirs ? (room.storage?.store.energy ?? 0) + (room.terminal?.store.energy ?? 0) : undefined,
    storedBefore: theirs ? storedBefore(previous, controller?.owner?.username ?? "") : undefined,
    terminal: theirs ? !!room.terminal : undefined,
    combatParts: combatPartsByPlayer(room),
    ...terrainRatios(room.name)
  }
  // Another player's base: map its walls and towers for conquest (see conquest/siegeIntel).
  recordSiege(room)
}

/** The earlier look to keep for the stored energy trend (see RoomIntel.storedBefore). */
function storedBefore(previous: RoomIntel | undefined, owner: string): RoomIntel["storedBefore"] {
  if (!previous || previous.controller?.owner !== owner || previous.storedEnergy === undefined) return undefined
  if (previous.storedBefore && Game.time - previous.storedBefore.tick < TREND_TICKS) return previous.storedBefore
  return { energy: previous.storedEnergy, tick: previous.tick }
}

/** Active ATTACK, RANGED_ATTACK and HEAL parts of other players' creeps in the room (not NPCs), by player. */
function combatPartsByPlayer(room: Room): { [username: string]: number } | undefined {
  const parts: { [username: string]: number } = {}
  for (const c of room.find(FIND_HOSTILE_CREEPS)) {
    const owner = c.owner.username
    if (owner === "Invader" || owner === "Source Keeper") continue
    const n = c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) + c.getActiveBodyparts(HEAL)
    if (0 < n) parts[owner] = (parts[owner] ?? 0) + n
  }
  return Object.keys(parts).length ? parts : undefined
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
