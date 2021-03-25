import ICreepEnergyRetrieval from "./ICommonCreepBehavior";

export default class NearbySourceEnergyHarvester implements ICreepEnergyRetrieval {
  retrieve(creep: Creep): void {
    const source: Source | null = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, {
      filter: s => s.room === creep.room
    });
    if (!source) return;
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source);
  }
}
