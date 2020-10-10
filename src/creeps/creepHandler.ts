import * as creepRoles from "./roles";
import HarvesterHandler from "./harvesterHandler";
import ICreepHandler from "./ICreepHandler";
import NoOpCreepHandler from "./noOpCreepHandler";
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
      default:
        return new NoOpCreepHandler();
    }
  }
}
