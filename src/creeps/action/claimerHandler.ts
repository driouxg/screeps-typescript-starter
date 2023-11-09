import { moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Try to expand to closest claimable room.
 */
export default class ClaimerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    let memory = creep.memory as ClaimerMemory
    memory.targetRoom = memory.targetRoom ?? creep.room.name

    if (creep.room.name === memory.targetRoom) {
      const controller = creep.room.controller as StructureController
      const claimCode = creep.claimController(controller)

      if (claimCode === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, controller.pos)
      if (claimCode === ERR_GCL_NOT_ENOUGH) return
    } else creep.moveTo(new RoomPosition(25, 25, memory.targetRoom))
  }
}

export interface ClaimerMemory extends CreepMemory {
  targetRoom: string
}
