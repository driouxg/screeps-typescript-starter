import ICreepHandler from "./ICreepHandler";

export default class BrawlerHandler implements ICreepHandler {
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
      this.fight();
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

  private fight(): void {
    const enemy: Creep | null = this.creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);

    if (!enemy) return;

    if (this.creep.attack(enemy) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(enemy);
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
