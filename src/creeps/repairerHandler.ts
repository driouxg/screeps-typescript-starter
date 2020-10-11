import BuilderHandler from "./builderHandler";
import ICreepHandler from "./ICreepHandler";

export default class RepairerHandler implements ICreepHandler {
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
      this.repair();
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

  private repair(): void {
    const structure = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
    });

    if (structure) {
      if (this.creep.repair(structure) === ERR_NOT_IN_RANGE) {
        this.creep.moveTo(structure);
      }
    } else {
      const builderHandler: BuilderHandler = new BuilderHandler(this.creep);
      builderHandler.handle();
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
