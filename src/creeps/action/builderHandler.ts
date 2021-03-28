import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class BuilderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;
  private priorityDict: { [structureName: string]: number };

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior;
    this.priorityDict = this.buildPriorityDict();
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.buildConstructionSite(creep);
    else this.creepBehavior.harvestEnergy(creep);
  }

  private buildConstructionSite(creep: Creep): void {
    const constructionSites: ConstructionSite<BuildableStructureConstant>[] = creep.room.find(
      FIND_MY_CONSTRUCTION_SITES
    );

    if (constructionSites.length <= 0) creep.suicide();

    const constructionSite: ConstructionSite = this.getPrioritizedConstructionSite(constructionSites);

    if (creep.build(constructionSite) === ERR_NOT_IN_RANGE)
      this.creepBehavior.moveToWithSinglePath(creep, constructionSite.pos);
  }

  private getPrioritizedConstructionSite(
    constructionSites: ConstructionSite<BuildableStructureConstant>[]
  ): ConstructionSite {
    let selectedSite = constructionSites[0];
    for (const constructionSite of constructionSites) {
      if (this.priorityDict[constructionSite.structureType] < this.priorityDict[selectedSite.structureType])
        selectedSite = constructionSite;
    }

    return selectedSite;
  }

  private buildPriorityDict(): { [structureName: string]: number } {
    const arr = [
      STRUCTURE_CONTAINER,
      STRUCTURE_ROAD,
      STRUCTURE_TOWER,
      STRUCTURE_EXTENSION,
      STRUCTURE_STORAGE,
      STRUCTURE_LINK,
      STRUCTURE_EXTRACTOR,
      STRUCTURE_LAB,
      STRUCTURE_OBSERVER,
      STRUCTURE_NUKER,
      STRUCTURE_WALL,
      STRUCTURE_RAMPART
    ];
    const dict: { [structureName: string]: number } = {};

    arr.forEach((structureName, idx) => (dict[structureName] = idx));

    return dict;
  }
}
