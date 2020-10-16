import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class WallRepairer implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  public handle(creep: Creep): void {
    return;
  }
}
