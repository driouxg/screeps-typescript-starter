import { smartMove } from "./common/movement"
import { hasEnergy, hasMaxEnergy, isWorking, moveToWithSinglePath } from "./common/creepBehavior"
import { offloadEnergy } from "./haulerHandler"
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
      if (!creep.pos.inRangeTo(source?.pos, 2)) {
        smartMove(creep, source, 2)
        return
      }

      // look for energy on the ground
      const energyPiles = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 3)

      if (!energyPiles || energyPiles.length <= 0) return

      if (creep.pickup(energyPiles[0]) === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, energyPiles[0].pos)
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    const memory = creep.memory as RemoteHaulerMemory
    if (hasEnergy(creep)) {
      if (creep.room.name === memory.birthRoomName) offloadEnergy(creep)
      else smartMove(creep, new RoomPosition(25, 25, memory.birthRoomName), 20)
    } else memory.working = false
  }
}

export interface RemoteHaulerMemory extends CreepMemory {
  targetSourceId: string
  birthRoomName: string
  offloadTargetPos: { x: number; y: number; roomName: string }
}
