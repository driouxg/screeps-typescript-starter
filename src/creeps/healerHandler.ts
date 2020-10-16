import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class HealerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) {
      this.heal(creep);
    } else {
      this.harvestEnergy(creep);
    }
  }

  private heal(creep: Creep): void {
    const allies: Creep[] = creep.room.find(FIND_MY_CREEPS);

    let allyToHeal: Creep | null = null;

    for (const ally of allies) {
      if (ally.hits !== ally.hitsMax) {
        allyToHeal = ally;
        break;
      }
    }

    if (!allyToHeal) return;

    if (creep.heal(allyToHeal) === ERR_NOT_IN_RANGE) {
      creep.moveTo(allyToHeal);
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
