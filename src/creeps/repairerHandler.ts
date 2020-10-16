import BuilderHandler from "./builderHandler";
import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class RepairerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) {
      this.repair(creep);
    } else {
      this.harvestEnergy(creep);
    }
  }

  private repair(creep: Creep): void {
    const structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
    });

    if (structure) {
      if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
        creep.moveTo(structure);
      }
    } else {
      const builderHandler: BuilderHandler = new BuilderHandler(creep);
      builderHandler.handle();
    }
  }

  private harvestEnergy(creep: Creep): void {
    const source: Source | null = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);

    if (!source) return;

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      creep.moveTo(source);
    }
  }
}
