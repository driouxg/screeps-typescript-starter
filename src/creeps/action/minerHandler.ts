import ICreepHandler from "./ICreepHandler"
import PullRequestEvent from "room/pullRequestEvent"
import { isRoomPositionJson, jsonToRoomPosition } from "utils/jsonMapper"
import * as creepRoles from "../roles"
import { freeMiningPosition } from "./common/miningPosition"

/**
 * Goal: If not next to source create Pull Event to get puller to move miner there. Then just mine.
 *
 * The spawn handler assigns the source and position. A miner whose memory lacks them (spawned by older code, or
 * edited by hand) picks its own instead of failing every tick.
 */
/** A miner still not at its source after this long (pullers busy, tile unreachable) picks another tile. */
const STUCK_TICKS = 300

export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as MinerMemory

    // Spawned to take over a tile another miner (smaller, or dying) still holds: get pulled next to the tile first,
    // then retire the old miner and step in, so the source is only idle for a tick or two.
    if (memory.replaces && !creep.spawning) {
      const old = Game.creeps[memory.replaces]
      const tile = isRoomPositionJson(memory.targetSourcePos) ? jsonToRoomPosition(memory.targetSourcePos) : null
      if (!old || !tile) delete memory.replaces
      else if (creep.pos.isNearTo(tile)) {
        old.suicide()
        delete memory.replaces
      } else {
        const waitAt = this.tileNextTo(tile, creep)
        if (waitAt) {
          creep.room.memory.events.push(new PullRequestEvent(waitAt, creep.name))
          return
        }
        // Nowhere to wait next to it: hand over now and accept the trip.
        old.suicide()
        delete memory.replaces
      }
    }

    let source = memory.targetSourceId ? Game.getObjectById(memory.targetSourceId as Id<Source>) : null
    if (!source) {
      source = this.leastMinedSource(creep)
      if (!source) return
      memory.targetSourceId = source.id
      delete (memory as Partial<MinerMemory>).targetSourcePos
    }

    if (creep.harvest(source) !== ERR_NOT_IN_RANGE) {
      delete memory.waitingSince
      // Already mining: record where, so the spawn handler knows this tile is taken.
      if (!isRoomPositionJson(memory.targetSourcePos)) {
        // Explicit fields: official servers pack RoomPosition coordinates, so spreading it copies nothing useful.
        const { x, y, roomName } = creep.pos
        memory.targetSourcePos = { x, y, roomName }
      }
      return
    }

    // Not at the source yet. If our tile got built on, or we've waited too long for it, find another; with no tile
    // left for us we're surplus, and retire rather than queue by the spawn for the rest of our life.
    memory.waitingSince = memory.waitingSince ?? Game.time
    const stuck = STUCK_TICKS < Game.time - memory.waitingSince
    if (!isRoomPositionJson(memory.targetSourcePos) || stuck || this.blocked(memory.targetSourcePos)) {
      const others = this.otherMiners(creep)
      const pos = freeMiningPosition(creep.room, source, others)
      if (!pos) {
        if (stuck) {
          console.log(`Miner ${creep.name}: no free tile at source ${source.id}, retiring`)
          creep.suicide()
        }
        return
      }
      memory.targetSourcePos = { x: pos.x, y: pos.y, roomName: pos.roomName }
      if (stuck) memory.waitingSince = Game.time
    }

    creep.room.memory.events.push(new PullRequestEvent(jsonToRoomPosition(memory.targetSourcePos), creep.name))
  }

  /** Whether a structure creeps can't stand on has been built on the tile. */
  private blocked(tile: RoomPositionJson): boolean {
    return jsonToRoomPosition(tile)
      .lookFor(LOOK_STRUCTURES)
      .some(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType))
  }

  /** A free walkable tile next to `tile` (and not on it), closest to the creep. */
  private tileNextTo(tile: RoomPosition, creep: Creep): RoomPosition | null {
    const terrain = creep.room.getTerrain()
    let best: RoomPosition | null = null
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tile.x + dx
        const y = tile.y + dy
        if ((dx === 0 && dy === 0) || x < 1 || 48 < x || y < 1 || 48 < y) continue
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
        const pos = new RoomPosition(x, y, tile.roomName)
        if (pos.lookFor(LOOK_STRUCTURES).some(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType)))
          continue
        const occupant = pos.lookFor(LOOK_CREEPS)[0]
        if (occupant && occupant.id !== creep.id) continue
        if (!best || creep.pos.getRangeTo(pos) < creep.pos.getRangeTo(best)) best = pos
      }
    }
    return best
  }

  private otherMiners(creep: Creep): Creep[] {
    return creep.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.MINER && c.id !== creep.id })
  }

  private leastMinedSource(creep: Creep): Source | null {
    const miners = this.otherMiners(creep)
    const minersOn = (s: Source) => miners.filter(m => (m.memory as MinerMemory).targetSourceId === s.id).length
    const sources = creep.room.find(FIND_SOURCES).sort((a, b) => minersOn(a) - minersOn(b))
    return sources[0] ?? null
  }
}

export interface MinerMemory extends CreepMemory {
  targetSourcePos: { x: number; y: number; roomName: string }
  targetSourceId: string
  /** Name of a smaller miner this one replaces on the same tile. */
  replaces?: string
  /** Tick this miner started waiting to be pulled to its tile. */
  waitingSince?: number
}
