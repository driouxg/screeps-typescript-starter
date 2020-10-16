import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";
import UpgraderHandler from "./upgraderHandler";

export default class BuilderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) {
      this.buildConstructionSite(creep);
    } else {
      this.harvestEnergy(creep);
    }
  }

  private buildConstructionSite(creep: Creep): void {
    const constructionSite: ConstructionSite | null = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

    if (constructionSite) {
      if (creep.build(constructionSite) === ERR_NOT_IN_RANGE) {
        creep.moveTo(constructionSite);
      }
    } else {
      // const upgradeHandler: UpgraderHandler = new UpgraderHandler();
      // upgradeHandler.handle(creep);
    }
  }

  private harvestEnergy(creep: Creep): void {
    const source: Source | null = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

    if (!source) return;

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      creep.moveTo(source);
    }
  }
}
