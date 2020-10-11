import * as creepRoles from "./roles";
import BrawlerHandler from "./brawlerHandler";
import BuilderHandler from "./builderHandler";
import HarvesterHandler from "./harvesterHandler";
import HealerHandler from "./healerHandler";
import ICreepHandler from "./ICreepHandler";
import NoOpCreepHandler from "./noOpCreepHandler";
import RepairerHandler from "./repairerHandler";
import UpgraderHandler from "./upgraderHandler";

export default class CreepHandler {
  public handle(): void {
    for (const creepName in Game.creeps) {
      const creep: Creep = Game.creeps[creepName];
      const handler: ICreepHandler = this.getHandler(creep);

      handler.handle();
    }
  }

  private getHandler(creep: Creep): ICreepHandler {
    switch (creep.memory.role) {
      case creepRoles.HARVESTER:
        return new HarvesterHandler(creep);
      case creepRoles.UPGRADER:
        return new UpgraderHandler(creep);
      case creepRoles.BUILDER:
        return new BuilderHandler(creep);
      case creepRoles.BRAWLER:
        return new BrawlerHandler(creep);
      case creepRoles.REPAIRER:
        return new RepairerHandler(creep);
      case creepRoles.HEALER:
        return new HealerHandler(creep);
      default:
        return new NoOpCreepHandler();
    }
  }
}
