import { jsonToRoomPosition } from "utils/jsonMapper"
import {
  findOffloadSpot,
  findPickupPosition,
  hasEnergy,
  hasMaxEnergy,
  isWorking,
  moveToWithSinglePath
} from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

export default class HaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
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
        else if (moveToWithSinglePath(creep, targetPos) === ERR_NO_PATH)
          memory.pickupTargetPos = findPickupPosition(creep)
      } else {
        // Pickup at location
        const energyPiles = creep.room.lookForAt(LOOK_ENERGY, targetPos)
        if (energyPiles.length <= 0) memory.pickupTargetPos = findPickupPosition(creep)
        if (creep.pickup(energyPiles[0]) !== ERR_NOT_IN_RANGE) memory.pickupTargetPos = findPickupPosition(creep)
        else if (moveToWithSinglePath(creep, targetPos) === ERR_NO_PATH)
          memory.pickupTargetPos = findPickupPosition(creep)
      }
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    const memory = creep.memory as HaulerMemory
    if (hasEnergy(creep)) offloadEnergy(creep)
    else memory.working = false
  }
}

export interface HaulerMemory extends CreepMemory {
  offloadTargetPos: { x: number; y: number; roomName: string }
  pickupTargetPos: { x: number; y: number; roomName: string }
}

export function offloadEnergy(creep: Creep) {
  const memory = creep.memory as HaulerMemory
  memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos
  let offloadSpot = jsonToRoomPosition(memory.offloadTargetPos)

  const offloadStructure = creep.room
    .lookForAt(LOOK_STRUCTURES, offloadSpot)
    .filter(c => c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_RAMPART)

  // Drop resources at position
  if (offloadStructure.length <= 0) {
    if (creep.pos.isEqualTo(offloadSpot.x, offloadSpot.y)) {
      creep.drop(RESOURCE_ENERGY)
      memory.offloadTargetPos = findOffloadSpot(creep)
    } else if (moveToWithSinglePath(creep, offloadSpot, 0) === ERR_NO_PATH)
      memory.offloadTargetPos = findOffloadSpot(creep)
  } else {
    // Transfer resources to structure
    if (creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
      memory.offloadTargetPos = findOffloadSpot(creep)
    else if (moveToWithSinglePath(creep, offloadSpot) === ERR_NO_PATH) memory.offloadTargetPos = findOffloadSpot(creep)
  }
}
