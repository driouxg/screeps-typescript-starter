import CreepBehavior from "./common/creepBehavior";
import ICreepHandler from "./ICreepHandler";
import { findTowers } from "../../utils/structureUtils";

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
    const towers = findTowers(creep.room).filter(tower => this.canSupplyTower(tower));

    if (0 < towers.length) {
      this.supplyTower(towers, creep);
    } else {
      this.repairStructure(creep);
    }
  }

  private canSupplyTower(tower: StructureTower): boolean {
    return tower && tower.energy < tower.energyCapacity;
  }

  private supplyTower(towers: StructureTower[], creep: Creep): void {
    const tower = towers[0];

    if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE)
      this.creepBehavior.moveToWithSinglePath(creep, tower.pos);
  }

  private repairStructure(creep: Creep): void {
    const structures = creep.room.find(FIND_MY_STRUCTURES, {
      filter: s => s.hits < s.hitsMax
    });

    if (0 < structures.length) {
      if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE)
        this.creepBehavior.moveToWithSinglePath(creep, structures[0].pos);
    } else this.nextCreepHandler.handle(creep);
  }
}
