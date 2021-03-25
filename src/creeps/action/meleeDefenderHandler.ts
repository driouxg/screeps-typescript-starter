import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class MeleeDefenderHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.fight(creep);
  }

  private fight(creep: Creep): void {
    const enemy: Creep | null = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);

    if (!enemy) return;

    if (creep.attack(enemy) === ERR_NOT_IN_RANGE) creep.moveTo(enemy);
  }
}
