import ICreepHandler from "./ICreepHandler";

export default class UpgraderHandler implements ICreepHandler {
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
      this.upgradeController();
    } else {
      this.harvestEnergyFromSource();
    }
  }

  private isWorking(): boolean {
    return this.creep.memory.working;
  }

  private hasEnergy(): boolean {
    return this.creep.store.getUsedCapacity() === 0;
  }

  private hasMaxEnergy(): boolean {
    return this.creep.store.getFreeCapacity() === 0;
  }

  private upgradeController(): void {
    const controller: StructureController | undefined = this.creep.room.controller;

    if (!controller) return;

    if (this.creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(controller);
    }
  }

  private harvestEnergyFromSource(): void {
    const source: Source | null = this.creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

    if (!source) return;

    if (this.creep.harvest(source) === ERR_NOT_IN_RANGE) {
      this.creep.moveTo(source);
    }
  }
}
