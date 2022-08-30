import CreepBehavior from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import RepairerMemory from "creeps/memory/repairerMemory"

/**
 * Repairer
 *
 * IF working
 *    IF structure is 100% || doesn't exist working = false
 *    IF noEnergy: collectEnergy
 *    ELSE: repair cached structure
 *
 * ELSE
 *    find new structure to repair and cache it
 *    working = true
 */
export default class RepairerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior
  private creepEnergyRetrieval: ICreepEnergyRetrieval

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior
    this.creepEnergyRetrieval = new StructureEnergyCollector()
  }

  public handle(creep: Creep): void {
    if (this.creepBehavior.isWorking(creep)) this.repair(creep)
    else this.decideOnStructureToRepair(creep)
  }

  private repair(creep: Creep) {
    if (!this.creepBehavior.hasEnergy(creep)) this.creepEnergyRetrieval.retrieve(creep)

    const { x, y, roomName } = (creep.memory as RepairerMemory).structurePos
    const structures = new RoomPosition(x, y, roomName).lookFor(LOOK_STRUCTURES)
    if (structures.length <= 0) creep.memory.working = false
    const structure = structures[0]

    if (structure.hits === structure.hitsMax || creep.repair(structure) === ERR_INVALID_TARGET)
      creep.memory.working = false
    else if (creep.repair(structure) === ERR_NOT_IN_RANGE) this.creepBehavior.moveToWithSinglePath(creep, structure.pos)
  }

  private decideOnStructureToRepair(creep: Creep) {
    const structures = creep.room.find(FIND_STRUCTURES, {
      filter: s => this.isStructureLowHits(s) && creep.getActiveBodyparts(WORK) * 100 && s.hitsMax - s.hits
    })

    if (structures.length <= 0) return
    ;(creep.memory as RepairerMemory).structurePos = structures[0].pos
    creep.memory.working = true
  }

  private isStructureLowHits(s: AnyStructure) {
    return s.hits < s.hitsMax * 0.8
  }
}
