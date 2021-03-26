import { findSpawns } from "utils/structureUtils";
import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class SpawnHarvesterHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }
  handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.hasMaxEnergy(creep)) {
      const spawns = findSpawns(creep.room);

      if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, spawns[0].pos);
    } else this.creepBehavior.harvestEnergy(creep);
  }
}
