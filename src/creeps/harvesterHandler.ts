import ICreepHandler from "./IcreepHandler";

export default class HarvesterHandler implements ICreepHandler {
  public move(creep: Creep): void {
    if (!this.hasEnergy(creep)) {
      creep.memory.working = false;
    }

    if (this.hasMaxEnergy(creep)) {
      creep.memory.working = true;
    }

    if (this.isWorking(creep)) {
      const spawn: StructureSpawn | null = creep.pos.findClosestByPath(FIND_MY_SPAWNS);

      if (!spawn) return;
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn.pos);
    } else {
      const source: Source | null = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

      if (!source) return;

      if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
    }
  }

  public attack(creep: Creep): void {
    creep.say("I can't attack");
  }

  private isWorking(creep: Creep) {
    return creep.memory.working;
  }

  private hasEnergy(creep: Creep): boolean {
    return creep.store.energy > 0;
  }

  private hasMaxEnergy(creep: Creep): boolean {
    return creep.store.getFreeCapacity() === 0;
  }
}
