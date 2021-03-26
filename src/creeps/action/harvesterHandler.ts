import { findContainers, findExtensions, findSpawns, findStorage } from "utils/structureUtils";
import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class HarvesterHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.hasMaxEnergy(creep)) {
      // offload to spawns
      const spawns = findSpawns(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY));
      if (0 < spawns.length) {
        if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
          this.creepBehavior.moveToWithSinglePath(creep, spawns[0].pos);
        return;
      }

      // offload to storage
      const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY));
      if (0 < storage.length) {
        if (creep.transfer(storage[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
          this.creepBehavior.moveToWithSinglePath(creep, storage[0].pos);
        return;
      }

      // offload to contain
      const containers = findContainers(creep.room).filter(c => 0 < c.store.getFreeCapacity(RESOURCE_ENERGY));
      if (0 < containers.length) {
        if (creep.transfer(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
          this.creepBehavior.moveToWithSinglePath(creep, containers[0].pos);
        return;
      }

      // offload to extensions
      const extensions = findExtensions(creep.room).filter(e => 0 < e.store.getFreeCapacity(RESOURCE_ENERGY));
      if (0 < extensions.length) {
        if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
          this.creepBehavior.moveToWithSinglePath(creep, extensions[0].pos);
        return;
      }
    } else {
      this.creepBehavior.harvestEnergy(creep);
    }
  }
}
