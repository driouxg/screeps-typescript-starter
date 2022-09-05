import ICreepHandler from "./ICreepHandler"

export default class RemoteDropMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteDropMinerMemory

    const source = Game.getObjectById<Source>(memory.targetSourceId) as Source

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source.pos)
  }
}

export interface RemoteDropMinerMemory extends CreepMemory {
  //   targetRoomName: string
  targetSourceId: string
}
