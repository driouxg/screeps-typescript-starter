import {
  findOffloadSpot,
  findPickupPosition,
  hasEnergy,
  hasMaxEnergy,
  isWorking,
  moveToWithSinglePath
} from "creeps/common/creepBehavior"
import ICreepHandler from "./ICreepHandler"
import { jsonToRoomPosition } from "utils/jsonMapper"
import { HAULER } from "creeps/roles"

/**
 * Goal: Haul energy from target room name to offload room name. If it runs into another hauler that is trying to haul energy back, take their energy and finish the job for them.
 * TODO: add additional states instead of just working = true or false
 */
export default class HaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    if (creep.memory.role !== HAULER) return

    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else {
      if (hasMaxEnergy(creep)) creep.memory.working = true

      let memory = creep.memory as HaulerMemory

      // Go to target room name, look for energy piles greater than 500

      if (creep.pos.roomName !== memory.pickupRoomName) {
        moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.pickupRoomName))
        return
      }

      if (memory.pickupPos) {
        // attempt to pickup, else move to it
        const targetPos = jsonToRoomPosition(memory.pickupPos)

        if (!creep.pos.isNearTo(memory.pickupPos.x, memory.pickupPos.y)) {
          moveToWithSinglePath(creep, targetPos)
          return
        }

        const structures = creep.room.lookForAt(LOOK_STRUCTURES, targetPos)

        if (0 < structures.length) {
          // Withdraw from structure
          if (creep.withdraw(structures[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
            memory.pickupPos = findPickupPosition(creep)
          else if (moveToWithSinglePath(creep, targetPos) !== ERR_NOT_IN_RANGE)
            memory.pickupPos = findPickupPosition(creep)
        } else {
          // Pickup at location
          const energyPiles = creep.room.lookForAt(LOOK_ENERGY, targetPos)
          if (energyPiles.length <= 0) memory.pickupPos = findPickupPosition(creep)
          if (creep.pickup(energyPiles[0]) !== ERR_NOT_IN_RANGE) memory.pickupPos = findPickupPosition(creep)
          else if (moveToWithSinglePath(creep, targetPos) === ERR_NO_PATH) memory.pickupPos = findPickupPosition(creep)
        }
      } else {
        memory.pickupPos = findPickupPosition(creep)
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
  pickupRoomName: string
  pickupPos: RoomPosition
  offloadRoomName: string
  offloadPos: { x: number; y: number; roomName: string }
  //   pickupTargetPos: { x: number; y: number; roomName: string }
}

export function offloadEnergy(creep: Creep) {
  const memory = creep.memory as HaulerMemory
  memory.offloadPos = memory.offloadPos ?? creep.pos
  let offloadSpot = jsonToRoomPosition(memory.offloadPos)

  const offloadStructure = creep.room
    .lookForAt(LOOK_STRUCTURES, offloadSpot)
    .filter(c => c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_RAMPART)

  // Drop resources at position
  if (offloadStructure.length <= 0) {
    if (creep.pos.isEqualTo(offloadSpot.x, offloadSpot.y)) {
      creep.drop(RESOURCE_ENERGY)
      memory.offloadPos = findOffloadSpot(creep)
    } else if (moveToWithSinglePath(creep, offloadSpot) === ERR_NO_PATH) memory.offloadPos = findOffloadSpot(creep)
  } else {
    // Transfer resources to structure
    if (creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
      memory.offloadPos = findOffloadSpot(creep)
    else if (moveToWithSinglePath(creep, offloadSpot) === ERR_NO_PATH) memory.offloadPos = findOffloadSpot(creep)
  }
}
