import CreepBehavior from "./commonCreepBehavior";
import ICreepHandler from "./ICreepHandler";

export default class RepairerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;
  private nextCreepHandler: ICreepHandler;

  public constructor(creepBehavior: CreepBehavior, nextCreepHandler: ICreepHandler) {
    this.creepBehavior = creepBehavior;
    this.nextCreepHandler = nextCreepHandler;
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.repair(creep);
    else this.creepBehavior.harvestEnergy(creep);
  }

  private repair(creep: Creep): void {
    const structures: AnyStructure[] = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax && s.structureType !== STRUCTURE_WALL
    });

    if (0 < structures.length) {
      if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, structures[0].pos);
    } else {
      this.nextCreepHandler.handle(creep);
    }
  }
}
