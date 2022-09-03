import ICreepHandler from "./ICreepHandler"
import PullRequestEvent from "room/pullRequestEvent"
import { jsonToRoomPosition } from "utils/jsonMapper"

/**
 * Goal: If not next to source create Pull Event to get puller to move miner there. Then just mine.
 */
export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as MinerMemory
    // spawn handler will assign source and target position

    const source = Game.getObjectById(memory.targetSourceId) as Source
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      const targetPos = jsonToRoomPosition(memory.targetSourcePos)
      creep.room.memory.events.push(new PullRequestEvent(targetPos, creep.name))
    }
  }
}

export interface MinerMemory extends CreepMemory {
  targetSourcePos: { x: number; y: number; roomName: string }
  targetSourceId: string
}
