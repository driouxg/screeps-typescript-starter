import HaulerMemory from "creeps/memory/haulerMemory"
import { jsonToRoomPosition } from "utils/jsonMapper"
import {
  findOffloadSpot,
  harvestUntilMaxEnergy,
  hasEnergy,
  isWorking,
  moveToWithSinglePath,
  updateWorkingState
} from "./common/creepBehavior"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepHandler from "./ICreepHandler"

export default class HaulerHandler implements ICreepHandler {
  private creepEnergyRetrieval: ICreepEnergyRetrieval

  public constructor() {
    this.creepEnergyRetrieval = new StructureEnergyCollector()
  }

  handle(creep: Creep): void {
    updateWorkingState(creep)
    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
  }

  private workUntilNoEnergy(creep: Creep) {
    let memory = creep.memory as HaulerMemory
    memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos

    if (hasEnergy(creep)) {
      let offloadSpot = jsonToRoomPosition(memory.offloadTargetPos)

      const offloadStructure = creep.room.lookForAt(LOOK_STRUCTURES, offloadSpot)
      if (offloadStructure.length <= 0 || creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
        memory.offloadTargetPos = findOffloadSpot(creep)
      else moveToWithSinglePath(creep, offloadSpot)
    } else memory.working = false
  }
}
