import * as creepRoles from "./roles";
import HarvesterHandler from "./harvesterHandler";
import ICreepHandler from "./IcreepHandler";
import NoOpCreepHandler from "./noOpCreepHandler";

export default class CreepHandler {
  public handle(): void {
    for (const creepName in Game.creeps) {
      const creep: Creep = Game.creeps[creepName];
      const handler: ICreepHandler = this.getHandler(creep.memory.role);

      handler.move(creep);
    }
  }

  private getHandler(role: string): ICreepHandler {
    if (role === creepRoles.HARVESTER) {
      return new HarvesterHandler();
    }

    return new NoOpCreepHandler();
  }
}
