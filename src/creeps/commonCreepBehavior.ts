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

    if (this.hasMaxEnergy(creep)) {
      creep.memory.working = true;
    }
  }
}
