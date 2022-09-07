import { jsonToRoomPosition } from "utils/jsonMapper"
import {
  findOffloadSpot,
  findPickupPosition,
  hasEnergy,
  hasMaxEnergy,
  isWorking,
  moveToWithSinglePath,
  updateWorkingState
} from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

export default class HaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    updateWorkingState(creep)
    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else {
      if (hasMaxEnergy(creep)) creep.memory.working = true

      let memory = creep.memory as HaulerMemory
      memory.pickupTargetPos = memory.pickupTargetPos || findPickupPosition(creep)

      const targetPos = jsonToRoomPosition(memory.pickupTargetPos)
      const structures = creep.room.lookForAt(LOOK_STRUCTURES, targetPos)

      if (0 < structures.length) {
        // Withdraw from structure
        if (creep.withdraw(structures[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
          memory.pickupTargetPos = findPickupPosition(creep)
        else moveToWithSinglePath(creep, targetPos)
      } else {
        // Pickup at location
        const energyPiles = creep.room.lookForAt(LOOK_ENERGY, targetPos)
        if (energyPiles.length <= 0) memory.pickupTargetPos = findPickupPosition(creep)
        if (creep.pickup(energyPiles[0]) !== ERR_NOT_IN_RANGE) memory.pickupTargetPos = findPickupPosition(creep)
        else moveToWithSinglePath(creep, targetPos)
      }
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    let memory = creep.memory as HaulerMemory
    memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos

    if (hasEnergy(creep)) {
      let offloadSpot = jsonToRoomPosition(memory.offloadTargetPos)

      const offloadStructure = creep.room.lookForAt(LOOK_STRUCTURES, offloadSpot)

      // Drop resources at position
      if (offloadStructure.length <= 0) {
        if (creep.pos.isEqualTo(offloadSpot.x, offloadSpot.y)) {
          creep.drop(RESOURCE_ENERGY)
          memory.offloadTargetPos = findOffloadSpot(creep)
        } else moveToWithSinglePath(creep, offloadSpot)
      } else {
        // Transfer resources to structure
        if (creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
          memory.offloadTargetPos = findOffloadSpot(creep)
        else moveToWithSinglePath(creep, offloadSpot)
      }
    } else memory.working = false
  }
}

export interface HaulerMemory extends CreepMemory {
  offloadTargetPos: { x: number; y: number; roomName: string }
  pickupTargetPos: { x: number; y: number; roomName: string }
}
