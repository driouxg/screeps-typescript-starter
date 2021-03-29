import { findExtensions, findSpawns, findStorage } from "utils/structureUtils";
import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class HaulerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
  }

  handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);
    if (this.creepBehavior.isWorking(creep)) this.offloadEnergy(creep);
    else this.collectEnergy(creep);
  }

  private offloadEnergy(creep: Creep): void {
    // offload to extensions
    const extensions = findExtensions(creep.room).filter(e => 0 < e.store.getFreeCapacity(RESOURCE_ENERGY));
    if (0 < extensions.length) {
      if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, extensions[0].pos);
      return;
    }

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

    // offload to containers positions that are not next to sources
    const containerPositions = creep.room.memory.positions[STRUCTURE_CONTAINER].filter(
      c => !this.isPositionNextToSource(creep, c)
    );

    if (0 < containerPositions.length) {
      if (creep.pos.isEqualTo(containerPositions[0].x, containerPositions[0].y)) creep.drop(RESOURCE_ENERGY);
      else creep.moveTo(containerPositions[0].x, containerPositions[0].y);
      return;
    }
  }

  private collectEnergy(creep: Creep): void {
    const energyPiles = this.findContainerPositionsNextToSource(creep)
      .map(p => creep.room.lookForAt(RESOURCE_ENERGY, p.x, p.y))
      .filter(e => this.filterPositionsThatHaveEnoughEnergyOnGround(creep, e));

    if (0 < energyPiles.length) {
      if (creep.pickup(energyPiles[0][0]) == ERR_NOT_IN_RANGE) creep.moveTo(energyPiles[0][0]);
      return;
    }

    const containers = this.findContainersNextToSource(creep)
      .filter(c => creep.store.getFreeCapacity() < c.store[RESOURCE_ENERGY])
      .sort((c1, c2) => c2.store[RESOURCE_ENERGY] - c1.store[RESOURCE_ENERGY]);

    if (0 < containers.length) {
      if (creep.withdraw(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.moveTo(containers[0]);
    }
  }

  private filterPositionsThatHaveEnoughEnergyOnGround(creep: Creep, energyPiles: Resource[]): boolean {
    return energyPiles && energyPiles.length === 1 && creep.store.getFreeCapacity() <= energyPiles[0].amount;
  }

  private findContainersNextToSource(creep: Creep): StructureContainer[] {
    const containerPositions = this.findContainerPositionsNextToSource(creep);

    let containers = [];
    for (const pos of containerPositions) {
      const structures = creep.room
        .lookForAt(LOOK_STRUCTURES, pos)
        .filter(s => s.structureType === STRUCTURE_CONTAINER);
      if (structures && structures.length === 1) containers.push(structures[0] as StructureContainer);
    }
    return containers;
  }

  private findContainerPositionsNextToSource(creep: Creep): RoomPosition[] {
    let containerPositions = [];
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (!this.isPositionNextToSource(creep, containerPos)) continue;

      containerPositions.push(containerPos);
    }

    return containerPositions;
  }

  private isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
    const sources = creep.room.find(FIND_SOURCES);

    for (const source of sources) {
      if (source.pos.isNearTo(pos.x, pos.y)) return true;
    }
    return false;
  }
}
