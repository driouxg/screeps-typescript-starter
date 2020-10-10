import ICreepHandler from "./ICreepHandler";

export default class HarvesterHandler implements ICreepHandler {
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
      const spawn: StructureSpawn | null = this.creep.pos.findClosestByPath(FIND_MY_SPAWNS);

      if (!spawn) return;
      if (this.creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) this.creep.moveTo(spawn.pos);
    } else {
      const source: Source | null = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

      if (!source) return;

      if (this.creep.harvest(source) === ERR_NOT_IN_RANGE) this.creep.moveTo(source);
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
}
