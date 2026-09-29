import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

export default class RemoteDropMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteDropMinerMemory

    const source = Game.getObjectById<Source>(memory.targetSourceId)
    if (!source) return

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, 1)
  }
}

export interface RemoteDropMinerMemory extends CreepMemory {
  //   targetRoomName: string
  targetSourceId: string
}
