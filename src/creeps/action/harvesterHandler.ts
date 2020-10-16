import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class HarvesterHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) {
      const spawn: StructureSpawn | null = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
      if (!spawn) return;
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawn.pos);
    } else {
      this.creepBehavior.harvestEnergy(creep);
    }
  }
}
