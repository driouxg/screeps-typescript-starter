import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";
import StructureEnergyCollector from "./common/structureEnergyHarvester";
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval";

export default class RepairerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior;
  private creepEnergyRetrieval: ICreepEnergyRetrieval;

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior;
    this.creepEnergyRetrieval = new StructureEnergyCollector();
  }

  public handle(creep: Creep): void {
    this.creepBehavior.updateWorkingState(creep);

    if (this.creepBehavior.isWorking(creep)) this.repair(creep);
    else this.creepEnergyRetrieval.retrieve(creep);
  }

  private repair(creep: Creep): void {
    const structures = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.hits < s.hitsMax * 0.8
    });

    if (structures.length <= 0) return;

    structures.sort((s1, s2) => s1.pos.getRangeTo(creep.pos) - s2.pos.getRangeTo(creep.pos));

    if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE)
      this.creepBehavior.moveToWithSinglePath(creep, structures[0].pos);
  }
}
