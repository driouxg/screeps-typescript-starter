import {
  findCachedStructurePositions,
  findExtensions,
  findSpawns,
  findStorage,
  findTowers
} from "utils/structureUtils";
import CreepBehavior from "./common/creepBehavior";
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval";
import StructureEnergyCollector from "./common/structureEnergyHarvester";
import ICreepHandler from "./ICreepHandler";

export default class HaulerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;
  private creepEnergyRetrieval: ICreepEnergyRetrieval;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
    this.creepEnergyRetrieval = new StructureEnergyCollector();
  }

  handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);
    if (this.creepBehavior.isWorking(creep)) this.offloadEnergy(creep);
    else this.creepEnergyRetrieval.retrieve(creep);
  }

  private offloadEnergy(creep: Creep): CreepReturnCode {
    // offload to extensions
    const extensions = findExtensions(creep.room).filter(e => 0 < e.store.getFreeCapacity(RESOURCE_ENERGY));
    if (0 < extensions.length) {
      extensions.sort(
        (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
      );
      if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        return this.creepBehavior.moveToWithSinglePath(creep, extensions[0].pos);
    }

    // offload to spawns
    const spawns = findSpawns(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY));
    if (0 < spawns.length) {
      if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        return this.creepBehavior.moveToWithSinglePath(creep, spawns[0].pos);
    }

    // offload to towers
    const towers = findTowers(creep.room).filter(t => 0 < t.store.getFreeCapacity(RESOURCE_ENERGY));
    if (0 < towers.length) {
      if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        return this.creepBehavior.moveToWithSinglePath(creep, towers[0].pos);
    }

    // offload to containers positions that are not next to sources until we reach max container amount
    const containerPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(
      c => !this.isPositionNextToSource(creep, c)
    );

    if (0 < containerPositions.length) {
      const pos = new RoomPosition(containerPositions[0].x, containerPositions[0].y, creep.room.name);
      const containers = creep.room.lookForAt(LOOK_STRUCTURES, pos) as StructureContainer[];
      const energyPiles = creep.room.lookForAt(LOOK_ENERGY, pos);

      if (
        (0 < containers.length && containers[0].store.energy < containers[0].store.getCapacity(RESOURCE_ENERGY)) ||
        (0 < energyPiles.length && energyPiles[0].amount < 2000)
      ) {
        if (creep.pos.isEqualTo(pos.x, pos.y)) {
          creep.drop(RESOURCE_ENERGY);
          return this.creepEnergyRetrieval.retrieve(creep);
        } else return this.creepBehavior.moveToWithSinglePath(creep, containerPositions[0]);
      }
    }

    // offload to storage
    const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY));
    if (0 < storage.length) {
      if (creep.transfer(storage[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        return this.creepBehavior.moveToWithSinglePath(creep, storage[0].pos);
    }

    return ERR_NOT_FOUND;
  }

  private isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
    const sources = creep.room.find(FIND_SOURCES);

    for (const source of sources) {
      if (source.pos.isNearTo(pos.x, pos.y)) return true;
    }
    return false;
  }
}
