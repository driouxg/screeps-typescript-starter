import { jsonToRoomPosition } from "utils/jsonMapper"
import CreepBehavior from "./common/creepBehavior"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepHandler from "./ICreepHandler"

export default class BuilderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior
  private priorityDict: { [structureName: string]: number }
  private creepEnergyRetrieval: ICreepEnergyRetrieval
  private nextHandler: ICreepHandler

  public constructor(commonCreepBehavior: CreepBehavior, nextHandler: ICreepHandler) {
    this.creepBehavior = commonCreepBehavior
    this.priorityDict = this.buildPriorityDict()
    this.creepEnergyRetrieval = new StructureEnergyCollector()
    this.nextHandler = nextHandler
  }

  public handle(creep: Creep): void {
    if (this.creepBehavior.isWorking(creep)) this.workUntilNoEnergy(creep)
    else this.creepBehavior.harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
  }

  private workUntilNoEnergy(creep: Creep) {
    if (this.creepBehavior.hasEnergy(creep)) {
      const constructionSites = jsonToRoomPosition(creep.memory.targetRoomPos).lookFor(LOOK_CONSTRUCTION_SITES)

      if (constructionSites.length <= 0 || creep.build(constructionSites[0]) === ERR_INVALID_TARGET)
        creep.memory.targetRoomPos = this.getPrioritizedConstructionSite(creep)

      if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, constructionSites[0].pos)
    } else creep.memory.working = false
  }

  private getPrioritizedConstructionSite(creep: Creep): RoomPosition {
    const constructionSites: ConstructionSite<BuildableStructureConstant>[] = creep.room.find(
      FIND_MY_CONSTRUCTION_SITES
    )

    if (constructionSites.length <= 0) return jsonToRoomPosition(creep.memory.targetRoomPos)

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
}
