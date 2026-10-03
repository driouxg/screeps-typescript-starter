import ICreepHandler from "./ICreepHandler"
import PullRequestEvent from "room/pullRequestEvent"
import { isRoomPositionJson, jsonToRoomPosition } from "utils/jsonMapper"
import * as creepRoles from "../roles"
import { containerSpot, freeMiningPosition, minerAt } from "./common/miningPosition"
import { smartMove } from "./common/movement"
import { sourceLinkOf } from "structures/links"

/**
 * Goal: If not next to source create Pull Event to get puller to move miner there. Then just mine.
 *
 * The spawn handler assigns the source and position. A miner whose memory lacks them (spawned by older code, or
 * edited by hand) picks its own instead of failing every tick.
 */
/** A miner still not at its source after this long (pullers busy, tile unreachable) picks another tile. */
const STUCK_TICKS = 300
/** A settled miner (working on its tile) only harvests, and redoes the full checks below this often. */
const SETTLED_RECHECK_TICKS = 50
/** WORK parts that drain a source on their own: 10 energy/tick, 2 per WORK. */
const WORK_PER_SOURCE = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER

export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as MinerMemory

    // Settled: on its tile and harvesting, so just keep harvesting. The checks below (replacements, container spot,
    // surplus miners) run again every SETTLED_RECHECK_TICKS, or as soon as harvesting fails.
    if (memory.settledAt !== undefined && Game.time - memory.settledAt < SETTLED_RECHECK_TICKS) {
      const source = Game.getObjectById(memory.targetSourceId as Id<Source>)
      const code = source ? creep.harvest(source) : ERR_INVALID_TARGET
      if (code === OK || code === ERR_NOT_ENOUGH_RESOURCES) {
        if (source) this.feedLink(creep, source)
        return
      }
    }
    delete memory.settledAt

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
          // Mine while waiting, if the tow happened to leave us next to the source.
          const source = Game.getObjectById(memory.targetSourceId as Id<Source>)
          if (source && creep.pos.isNearTo(source)) creep.harvest(source)
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

    if (this.settleOnContainer(creep, source)) return

    const code = creep.harvest(source)
    if (code !== ERR_NOT_IN_RANGE) {
      this.feedLink(creep, source)
      delete memory.waitingSince
      // Already mining: record where, so the spawn handler knows this tile is taken.
      if (!isRoomPositionJson(memory.targetSourcePos)) {
        // Explicit fields: official servers pack RoomPosition coordinates, so spreading it copies nothing useful.
        const { x, y, roomName } = creep.pos
        memory.targetSourcePos = { x, y, roomName }
      }
      const tile = jsonToRoomPosition(memory.targetSourcePos)
      if (creep.pos.isEqualTo(tile)) {
        if (!memory.replaces) memory.settledAt = Game.time
      }
      // Mining from next to our tile (e.g. beside the container a full-size miner belongs on, where a handover left
      // it): keep mining, and ask to be pulled onto the tile. A miner with MOVE parts walks there itself.
      else if (0 < creep.getActiveBodyparts(MOVE)) smartMove(creep, tile, 0)
      else creep.room.memory.events.push(new PullRequestEvent(tile, creep.name))
      return
    }

    // On our tile but out of reach of our source: the tile was picked for another source (or by older code). It can
    // never work, and pull requests to where we already stand do nothing, so pick a tile next to our source instead.
    if (isRoomPositionJson(memory.targetSourcePos) && creep.pos.isEqualTo(jsonToRoomPosition(memory.targetSourcePos))) {
      console.log(`Miner ${creep.name}: tile ${creep.pos} isn't next to source ${source.id}, picking another`)
      delete (memory as Partial<MinerMemory>).targetSourcePos
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

    const tile = jsonToRoomPosition(memory.targetSourcePos)
    // A miner with MOVE parts (the room's first) walks; the rest wait for a puller.
    if (0 < creep.getActiveBodyparts(MOVE)) smartMove(creep, tile, 0)
    else creep.room.memory.events.push(new PullRequestEvent(tile, creep.name))
  }

  /**
   * A miner with CARRY next to its source's link (see structures/links) puts what it harvests in the link, once one
   * more harvest wouldn't fit: haulers then needn't come. With the link full it just keeps harvesting, and what doesn't
   * fit drops into the container below it, as without a link.
   */
  private feedLink(creep: Creep, source: Source): void {
    if (creep.store.getCapacity(RESOURCE_ENERGY) <= 0) return
    if (creep.getActiveBodyparts(WORK) * HARVEST_POWER < creep.store.getFreeCapacity(RESOURCE_ENERGY)) return
    const link = sourceLinkOf(creep.room, source)
    if (link && creep.pos.isNearTo(link) && 0 < link.store.getFreeCapacity(RESOURCE_ENERGY))
      creep.transfer(link, RESOURCE_ENERGY)
  }

  /** Whether a structure creeps can't stand on has been built on the tile. */
  private blocked(tile: RoomPositionJson): boolean {
    return jsonToRoomPosition(tile)
      .lookFor(LOOK_STRUCTURES)
      .some(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType))
  }

  /**
   * A full-size miner (enough WORK to drain the source alone) belongs on the source's container spot: if it isn't
   * headed there, take the spot over from whichever smaller miner holds it. A smaller miner whose source already has a
   * full-size miner at work is surplus and retires. Returns true if the creep retired.
   */
  private settleOnContainer(creep: Creep, source: Source): boolean {
    const memory = creep.memory as MinerMemory
    const others = this.otherMiners(creep).filter(m => (m.memory as MinerMemory).targetSourceId === source.id)
    const isFull = (c: Creep) => WORK_PER_SOURCE <= c.getActiveBodyparts(WORK)

    if (!isFull(creep)) {
      if (others.some(m => isFull(m) && m.pos.isNearTo(source))) {
        console.log(`Miner ${creep.name}: a full-size miner works source ${source.id}, retiring`)
        creep.suicide()
        return true
      }
      return false
    }

    const spot = containerSpot(creep.room, source)
    const target = memory.targetSourcePos
    if (!spot || memory.replaces || (target && target.x === spot.x && target.y === spot.y)) return false

    const holder = minerAt(spot, others)
    const takenOver = holder && this.otherMiners(creep).some(m => (m.memory as MinerMemory).replaces === holder.name)
    if (holder && (isFull(holder) || takenOver)) return false
    memory.targetSourcePos = { x: spot.x, y: spot.y, roomName: spot.roomName }
    if (holder) memory.replaces = holder.name
    return false
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
  /** Tick this miner was last found working on its own tile; see SETTLED_RECHECK_TICKS. */
  settledAt?: number
}
