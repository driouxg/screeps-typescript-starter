import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class UpgraderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.upgradeController(creep);
    else this.creepBehavior.harvestEnergy(creep);
  }

  private upgradeController(creep: Creep): void {
    const controller: StructureController | undefined = creep.room.controller;

    if (!controller) return;

    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      this.creepBehavior.moveToWithSinglePath(creep, controller.pos);
    }
  }
}
