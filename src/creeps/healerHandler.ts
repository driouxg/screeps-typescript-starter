import ICreepHandler from "./ICreepHandler";

export default class HealerHandler implements ICreepHandler {
  private creep: Creep;

  public constructor(creep: Creep) {
    this.creep = creep;
  }

  public handle(): void {
    if (!this.hasEnergy()) {
      this.creep.memory.working = false;
    }

    if (this.hasMaxEnergy()) {
      this.creep.memory.working = true;
    }

    if (this.isWorking()) {
      this.heal();
    } else {
      this.harvestEnergy();
    }
  }

  private isWorking() {
    return this.creep.memory.working;
  }

  private hasEnergy(): boolean {
    return this.creep.store.energy > 0;
  }

  private hasMaxEnergy(): boolean {
    return this.creep.store.getFreeCapacity() === 0;
  }

  private heal(): void {
    const allies: Creep[] = this.creep.room.find(FIND_MY_CREEPS);

    let allyToHeal: Creep | null = null;

    for (const ally of allies) {
      if (ally.hits !== ally.hitsMax) {
        allyToHeal = ally;
        break;
      }
    }

    if (!allyToHeal) return;

    if (this.creep.heal(allyToHeal) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(allyToHeal);
    }
  }

  private harvestEnergy(): void {
    const source: Source | null = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

    if (!source) return;

    if (this.creep.harvest(source) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(source);
    }
  }
}
