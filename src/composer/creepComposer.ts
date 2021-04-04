import * as creepRoles from "../creeps/roles";
import BuilderHandler from "creeps/action/builderHandler";
import CreepBehavior from "creeps/action/common/creepBehavior";
import HealerHandler from "creeps/action/healerHandler";
import ICreepHandler from "creeps/action/ICreepHandler";
import MeleeDefenderHandler from "creeps/action/meleeDefenderHandler";
import RepairerHandler from "creeps/action/repairerHandler";
import UpgraderHandler from "creeps/action/upgraderHandler";
import MinerHandler from "creeps/action/minerHandler";
import PullerHandler from "creeps/action/pullerHandler";
import HaulerHandler from "creeps/action/haulerHandler";

export default class CreepComposer {
  public creepHandlerDict(): { [creepRole: string]: ICreepHandler } {
    const creepBehavior = new CreepBehavior();

    const dictionary: { [creepRole: string]: ICreepHandler } = {};
    dictionary[creepRoles.UPGRADER] = new UpgraderHandler();
    dictionary[creepRoles.BUILDER] = this.builderHandler(creepBehavior);
    dictionary[creepRoles.MELEE_DEFENDER] = new MeleeDefenderHandler();
    dictionary[creepRoles.REPAIRER] = this.repairerHandler(creepBehavior);
    dictionary[creepRoles.HEALER] = new HealerHandler();
    dictionary[creepRoles.MINER] = new MinerHandler();
    dictionary[creepRoles.PULLER] = new PullerHandler();
    dictionary[creepRoles.HAULER] = new HaulerHandler(creepBehavior);

    return dictionary;
  }

  public builderHandler(creepBehavior: CreepBehavior): BuilderHandler {
    return new BuilderHandler(creepBehavior, this.repairerHandler(creepBehavior));
  }

  public repairerHandler(creepBehavior: CreepBehavior): RepairerHandler {
    return new RepairerHandler(creepBehavior);
  }
}
