export default class CreepBehavior {
  public isWorking(creep: Creep): boolean {
    return creep.memory.working;
  }

  public hasEnergy(creep: Creep): boolean {
    return 0 < creep.store.energy;
  }

  public hasMaxEnergy(creep: Creep): boolean {
    return creep.store.getFreeCapacity() === 0;
  }

  public updateWorkingState(creep: Creep): void {
    if (!this.hasEnergy(creep)) {
      creep.memory.working = false;
    }

    if (this.hasMaxEnergy(creep) || !this.canStoreEnergy(creep)) {
      creep.memory.working = true;
    }
  }

  private canStoreEnergy(creep: Creep): boolean {
    return creep.store.getCapacity() !== 0 && creep.store.getCapacity() !== null;
  }

  public harvestEnergy(creep: Creep): void {
    const source: Source | null = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (!source) return;
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
  }

  public moveToWithSinglePath(creep: Creep, pos: RoomPosition): void {
    // eslint-disable-next-line id-blacklist
    creep.moveTo(pos, { reusePath: Number.MAX_SAFE_INTEGER });
  }
}
