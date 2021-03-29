import ICreepHandler from "./ICreepHandler";

export default class HealerHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    this.heal(creep);
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
}
