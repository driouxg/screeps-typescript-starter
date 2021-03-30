import { findCachedStructurePositions, findContainers, findStorage } from "utils/structureUtils";
import ICreepEnergyRetrieval from "./ICreepEnergyRetrieval";

export default class StructureEnergyCollector implements ICreepEnergyRetrieval {
  retrieve(
    creep: Creep
  ): CreepActionReturnCode | CreepMoveReturnCode | ERR_NO_PATH | ERR_NOT_FOUND | ERR_NOT_ENOUGH_RESOURCES {
    // energy piles
    const energyPiles = this.findContainerPositionsNextToSource(creep)
      .map(p => creep.room.lookForAt(RESOURCE_ENERGY, p.x, p.y))
      .filter(e => this.filterPositionsThatHaveEnoughEnergyOnGround(creep, e));

    if (0 < energyPiles.length) {
      if (creep.pickup(energyPiles[0][0]) == ERR_NOT_IN_RANGE) return creep.moveTo(energyPiles[0][0]);
    }

    // containers
    const containers = this.findContainersNextToSource(creep)
      .filter(c => creep.store.getFreeCapacity() < c.store[RESOURCE_ENERGY])
      .sort((c1, c2) => c2.store[RESOURCE_ENERGY] - c1.store[RESOURCE_ENERGY]);

    if (0 < containers.length) {
      if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) return creep.moveTo(containers[0]);
    }

    // storage
    const storage = findStorage(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY));
    if (0 < storage.length) {
      if (creep.withdraw(storage[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) return creep.moveTo(storage[0]);
    }

    // extensions
    const extensions = findContainers(creep.room).filter(e => 0 < e.store.getUsedCapacity(RESOURCE_ENERGY));

    if (0 < extensions.length) {
      if (creep.withdraw(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) return creep.moveTo(extensions[0]);
    }

    // spawns
    // const spawns = findSpawns(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY));

    // if (0 < spawns.length) {
    //   if (creep.withdraw(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(spawns[0]);
    //   return;
    // }

    return ERR_NOT_FOUND;
  }

  private filterPositionsThatHaveEnoughEnergyOnGround(creep: Creep, energyPiles: Resource[]): boolean {
    return energyPiles && energyPiles.length === 1 && creep.store.getFreeCapacity() <= energyPiles[0].amount;
  }

  private findContainersNextToSource(creep: Creep): StructureContainer[] {
    const containerPositions = findContainers(creep.room);
    return containerPositions.filter(c => this.isPositionNextToSource(creep, c.pos));
  }

  private findContainerPositionsNextToSource(creep: Creep): RoomPosition[] {
    const poss = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER);
    return poss.filter(p => this.isPositionNextToSource(creep, p));
  }

  private isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
    const sources = creep.room.find(FIND_SOURCES);

    for (const source of sources) {
      if (source.pos.isNearTo(pos.x, pos.y)) return true;
    }
    return false;
  }
}
