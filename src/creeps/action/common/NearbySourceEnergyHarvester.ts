import ICreepEnergyRetrieval from "./ICreepEnergyRetrieval";

export default class NearbySourceEnergyHarvester implements ICreepEnergyRetrieval {
  retrieve(
    creep: Creep
  ): CreepActionReturnCode | CreepMoveReturnCode | ERR_NO_PATH | ERR_NOT_FOUND | ERR_NOT_ENOUGH_RESOURCES {
    const sources = creep.room.find(FIND_SOURCES);

    for (const source of sources) {
      if (creep.pos.isNearTo(source.pos)) return creep.harvest(source);
    }

    return ERR_NOT_IN_RANGE;
  }
}
