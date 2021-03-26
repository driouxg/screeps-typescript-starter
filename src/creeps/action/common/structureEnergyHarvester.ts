import { findContainers, findSpawns, findStorage } from "utils/structureUtils";
import ICreepEnergyRetrieval from "./ICommonCreepBehavior";

export default class StructureEnergyCollector implements ICreepEnergyRetrieval {
  retrieve(creep: Creep): void {
    // storage
    const storage = findStorage(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY));
    if (0 < storage.length) {
      if (creep.withdraw(storage[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(storage[0]);
      return;
    }

    // containers
    const containers = findContainers(creep.room).filter(c => 0 < c.store.getUsedCapacity(RESOURCE_ENERGY));

    if (0 < containers.length) {
      if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(containers[0]);
      return;
    }

    // extensions
    const extensions = findContainers(creep.room).filter(e => 0 < e.store.getUsedCapacity(RESOURCE_ENERGY));

    if (0 < extensions.length) {
      if (creep.withdraw(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(extensions[0]);
      return;
    }

    // spawns
    // const spawns = findSpawns(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY));

    // if (0 < spawns.length) {
    //   if (creep.withdraw(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawns[0]);
    //   return;
    // }
  }
}
