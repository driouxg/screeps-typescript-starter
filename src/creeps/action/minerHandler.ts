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
export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as MinerMemory

    let source = memory.targetSourceId ? Game.getObjectById(memory.targetSourceId as Id<Source>) : null
    if (!source) {
      source = this.leastMinedSource(creep)
      if (!source) return
      memory.targetSourceId = source.id
      delete (memory as Partial<MinerMemory>).targetSourcePos
    }

    if (creep.harvest(source) !== ERR_NOT_IN_RANGE) {
      // Already mining: record where, so the spawn handler knows this tile is taken.
      if (!isRoomPositionJson(memory.targetSourcePos)) {
        // Explicit fields: official servers pack RoomPosition coordinates, so spreading it copies nothing useful.
        const { x, y, roomName } = creep.pos
        memory.targetSourcePos = { x, y, roomName }
      }
      return
    }

    if (!isRoomPositionJson(memory.targetSourcePos)) {
      const pos = freeMiningPosition(creep.room, source, this.otherMiners(creep))
      if (!pos) return
      memory.targetSourcePos = { x: pos.x, y: pos.y, roomName: pos.roomName }
    }

    creep.room.memory.events.push(new PullRequestEvent(jsonToRoomPosition(memory.targetSourcePos), creep.name))
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
}
