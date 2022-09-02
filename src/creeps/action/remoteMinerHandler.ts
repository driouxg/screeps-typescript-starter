import RemoteMinerMemory from "creeps/memory/remoteMinerMemory"
import { jsonToRoomPosition } from "utils/jsonMapper"
import { findOffloadSpot, hasEnergy, hasMaxEnergy, isWorking, moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Travel to target room. Once there pick a target source and cache it.
 * Travel back home, offload, then go back to cached sourceId.
 */
export default class RemoteMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteMinerMemory

    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else {
      if (creep.room.name === memory.targetRoomName) {
        if (hasMaxEnergy(creep)) memory.working = true
        if (memory.targetSourceId) {
          const source = Game.getObjectById(memory.targetSourceId) as Source
          if (creep.harvest(source) === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, source.pos)
        } else memory.targetSourceId = creep.room.find(FIND_SOURCES)[0].id
      } else moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.targetRoomName))
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    const memory = creep.memory as RemoteMinerMemory
    if (hasEnergy(creep)) {
      if (creep.room.name === memory.birthRoomName) this.offloadEnergy(creep)
      else moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.birthRoomName))
    } else memory.working = false
  }

  private offloadEnergy(creep: Creep) {
    const memory = creep.memory as RemoteMinerMemory
    memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos
    let offloadSpot = jsonToRoomPosition(memory.offloadTargetPos)

    const offloadStructure = creep.room.lookForAt(LOOK_STRUCTURES, offloadSpot)
    if (offloadStructure.length <= 0 || creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
      memory.offloadTargetPos = findOffloadSpot(creep)
    else moveToWithSinglePath(creep, offloadSpot)
  }
}
