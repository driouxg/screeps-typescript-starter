import { jsonToRoomPosition } from "utils/jsonMapper"
import { findOffloadSpot, hasEnergy, hasMaxEnergy, isWorking, moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

export default class RemoteHaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteHaulerMemory

    const source = Game.getObjectById<Source>(memory.targetSourceId)
    if (!source) {
      creep.suicide()
      return
    }

    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else {
      if (hasMaxEnergy(creep)) memory.working = true
      if (!creep.pos.inRangeTo(source?.pos, 2)) creep.moveTo(source.pos)

      // look for energy on the ground
      const energyPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 3)

      if (!energyPiles || energyPiles.length <= 0) return

      if (creep.pickup(energyPiles[0]) === ERR_NOT_IN_RANGE) creep.moveTo(energyPiles[0].pos)
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    const memory = creep.memory as RemoteHaulerMemory
    if (hasEnergy(creep)) {
      if (creep.room.name === memory.birthRoomName) this.offloadEnergy(creep)
      else moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.birthRoomName))
    } else memory.working = false
  }

  private offloadEnergy(creep: Creep) {
    const memory = creep.memory as RemoteHaulerMemory
    memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos
    let offloadSpot = jsonToRoomPosition(memory.offloadTargetPos)

    const offloadStructure = creep.room.lookForAt(LOOK_STRUCTURES, offloadSpot)
    if (offloadStructure.length <= 0 || creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
      memory.offloadTargetPos = findOffloadSpot(creep)
    else moveToWithSinglePath(creep, offloadSpot)
  }
}

export interface RemoteHaulerMemory extends CreepMemory {
  targetSourceId: string
  birthRoomName: string
  offloadTargetPos: { x: number; y: number; roomName: string }
}
