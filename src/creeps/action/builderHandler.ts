import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class BuilderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;
  private nextCreepHandler: ICreepHandler;

  public constructor(commonCreepBehavior: CreepBehavior, nextCreepHandler: ICreepHandler) {
    this.creepBehavior = commonCreepBehavior;
    this.nextCreepHandler = nextCreepHandler;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.buildConstructionSite(creep);
    else this.creepBehavior.harvestEnergy(creep);
  }

  private buildConstructionSite(creep: Creep): void {
    const constructionSite: ConstructionSite | null = creep.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);

    if (constructionSite) {
      if (creep.build(constructionSite) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, constructionSite.pos);
    } else {
      this.nextCreepHandler.handle(creep);
    }
  }
}
