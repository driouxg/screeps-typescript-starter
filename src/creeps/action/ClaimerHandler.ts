import { moveToWithSinglePath } from "creeps/common/creepBehavior"
import ICreepHandler from "./ICreepHandler"
import { CLAIMER } from "creeps/roles"

/**
 * Goal: Try to expand to closest claimable room.
 */
export default class ClaimerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    if (creep.memory.role !== CLAIMER) return

    let memory = creep.memory as ClaimerMemory

    if (creep.room.name === memory.targetRoomName) {
      const controller = creep.room.controller as StructureController
      const claimCode = creep.claimController(controller)

      if (claimCode === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, controller.pos)
      if (claimCode === ERR_GCL_NOT_ENOUGH) return
      // } else creep.moveTo(new RoomPosition(25, 25, memory.targetRoomName))
    } else moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.targetRoomName))
  }
}

export interface ClaimerMemory extends CreepMemory {
  targetRoomName: string
}
