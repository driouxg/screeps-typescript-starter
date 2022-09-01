import BuilderMemory from "creeps/memory/builderMemory"
import { jsonToRoomPosition } from "utils/jsonMapper"
import CreepBehavior from "./common/creepBehavior"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Repair structures if below 80%. Otherwise, build new structures.
 *
 * Repair target
 * IF: target can't be repaired
 * repairableTargets = getRepairable()
 *
 * IF: targets.size <= 0
 *    build()
 */
export default class BuilderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior
  private priorityDict: { [structureName: string]: number }
  private creepEnergyRetrieval: ICreepEnergyRetrieval

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior
    this.priorityDict = this.buildPriorityDict()
    this.creepEnergyRetrieval = new StructureEnergyCollector()
  }

  public handle(creep: Creep): void {
    if (this.creepBehavior.isWorking(creep)) this.workUntilNoEnergy(creep)
    else this.creepBehavior.harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
  }

  private workUntilNoEnergy(creep: Creep) {
    let memory = creep.memory as BuilderMemory
    memory.buildTargetPos = memory.buildTargetPos ?? { x: 0, y: 0, roomName: creep.room.name }
    memory.repairTargetPos = memory.repairTargetPos ?? { x: 0, y: 0, roomName: creep.room.name }

    if (this.creepBehavior.hasEnergy(creep)) {
      this.repair(creep)
    } else memory.working = false
  }

  private build(creep: Creep) {
    let memory = creep.memory as BuilderMemory

    const constructionSites = jsonToRoomPosition(memory.buildTargetPos).lookFor(LOOK_CONSTRUCTION_SITES)

    if (constructionSites.length <= 0 || creep.build(constructionSites[0]) === ERR_INVALID_TARGET) {
      memory.buildTargetPos = this.getPrioritizedConstructionSite(creep)
    }

    if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE)
      this.creepBehavior.moveToWithSinglePath(creep, constructionSites[0].pos)
  }

  private getPrioritizedConstructionSite(creep: Creep): RoomPosition {
    const constructionSites: ConstructionSite<BuildableStructureConstant>[] = creep.room.find(
      FIND_MY_CONSTRUCTION_SITES
    )

    if (constructionSites.length <= 0) return jsonToRoomPosition((creep.memory as BuilderMemory).buildTargetPos)

    let selectedSite = constructionSites[0]
    for (const constructionSite of constructionSites) {
      if (this.priorityDict[constructionSite.structureType] < this.priorityDict[selectedSite.structureType])
        selectedSite = constructionSite
    }

    return selectedSite.pos
  }

  private buildPriorityDict(): { [structureName: string]: number } {
    const arr = [
      STRUCTURE_EXTENSION,
      STRUCTURE_CONTAINER,
      STRUCTURE_TOWER,
      STRUCTURE_STORAGE,
      STRUCTURE_ROAD,
      STRUCTURE_LINK,
      STRUCTURE_EXTRACTOR,
      STRUCTURE_LAB,
      STRUCTURE_OBSERVER,
      STRUCTURE_NUKER,
      STRUCTURE_WALL,
      STRUCTURE_RAMPART
    ]
    const dict: { [structureName: string]: number } = {}

    arr.forEach((structureName, idx) => (dict[structureName] = idx))

    return dict
  }

  private repair(creep: Creep) {
    let memory = creep.memory as BuilderMemory

    const structures = jsonToRoomPosition(memory.repairTargetPos).lookFor(LOOK_STRUCTURES)

    if (
      structures.length <= 0 ||
      creep.repair(structures[0]) === ERR_INVALID_TARGET ||
      this.isStructureFullHealth(structures[0])
    ) {
      const repairableStructures = this.getRepairableStructures(creep)

      if (repairableStructures.length <= 0) return this.build(creep)

      memory.repairTargetPos = repairableStructures[0].pos
    }

    if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE)
      this.creepBehavior.moveToWithSinglePath(creep, structures[0].pos)
  }

  private getRepairableStructures = (creep: Creep): AnyStructure[] =>
    creep.room.find(FIND_STRUCTURES, {
      filter: s => this.isStructureLowHits(s)
    })

  private isStructureLowHits(s: AnyStructure) {
    return s.hits < s.hitsMax * 0.8
  }

  private isStructureFullHealth(s: Structure<StructureConstant>) {
    return s.hits === s.hitsMax
  }
}
