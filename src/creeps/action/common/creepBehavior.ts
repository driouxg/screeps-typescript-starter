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

  public moveToWithSinglePath(creep: Creep, pos: RoomPosition): void {
    // eslint-disable-next-line id-blacklist
    creep.moveTo(pos, { reusePath: 10 });
  }
}
