import CreepBehavior from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import { jsonToRoomPosition } from "utils/jsonMapper"

/**
 * Goal: Repair a target structure under a certain percentage of health. Use cached value if possible.
 */
export default class RepairerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior
  private creepEnergyRetrieval: ICreepEnergyRetrieval

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior
    this.creepEnergyRetrieval = new StructureEnergyCollector()
  }

  public handle(creep: Creep): void {
    if (this.creepBehavior.isWorking(creep)) this.workUntilNoEnergy(creep)
    else this.creepBehavior.harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
  }

  private workUntilNoEnergy(creep: Creep) {
    if (this.creepBehavior.hasEnergy(creep)) {
      const { x, y, roomName } = creep.memory.targetRoomPos

      const structures = new RoomPosition(x, y, roomName).lookFor(LOOK_STRUCTURES)
      if (
        structures.length <= 0 ||
        creep.repair(structures[0]) === ERR_INVALID_TARGET ||
        this.isStructureFullHealth(structures[0])
      )
        creep.memory.targetRoomPos = this.getRepairableStructure(creep)

      if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, structures[0].pos)
    } else creep.memory.working = false
  }

  private getRepairableStructure(creep: Creep): RoomPosition {
    const structures = creep.room.find(FIND_STRUCTURES, {
      filter: s => this.isStructureLowHits(s)
    })

    if (structures.length <= 0) return jsonToRoomPosition(creep.memory.targetRoomPos)

    return structures[0].pos
  }

  private isStructureLowHits(s: AnyStructure) {
    return s.hits < s.hitsMax * 0.8
  }

  private isStructureFullHealth(s: Structure<StructureConstant>) {
    return s.hits === s.hitsMax
  }
}
