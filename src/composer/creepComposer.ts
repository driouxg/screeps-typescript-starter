import * as creepRoles from "../creeps/roles";
import BuilderHandler from "creeps/builderHandler";
import CreepBehavior from "creeps/commonCreepBehavior";
import HarvesterHandler from "creeps/harvesterHandler";
import HealerHandler from "creeps/healerHandler";
import ICreepHandler from "creeps/ICreepHandler";
import MeleeDefenderHandler from "creeps/meleeDefenderHandler";
import RepairerHandler from "creeps/repairerHandler";
import UpgraderHandler from "creeps/upgraderHandler";

export default class CreepComposer {
  public creepHandlerDict(): { [creepRole: string]: ICreepHandler } {
    const creepBehavior: CreepBehavior = new CreepBehavior();

    const dictionary: { [creepRole: string]: ICreepHandler } = {};
    dictionary[creepRoles.HARVESTER] = this.harvesterHandler(creepBehavior);
    dictionary[creepRoles.UPGRADER] = this.upgraderHandler(creepBehavior);
    dictionary[creepRoles.BUILDER] = this.builderHandler(creepBehavior);
    dictionary[creepRoles.MELEE_DEFENDER] = this.meleeDefenderHandler(creepBehavior);
    dictionary[creepRoles.REPAIRER] = this.repairerHandler(creepBehavior);
    dictionary[creepRoles.HEALER] = this.healerHandler(creepBehavior);

    return dictionary;
  }

  public harvesterHandler(creepBehavior: CreepBehavior): HarvesterHandler {
    return new HarvesterHandler(creepBehavior);
  }

  public upgraderHandler(creepBehavior: CreepBehavior): UpgraderHandler {
    return new UpgraderHandler(creepBehavior);
  }

  public builderHandler(creepBehavior: CreepBehavior): BuilderHandler {
    return new BuilderHandler(creepBehavior, this.harvesterHandler(creepBehavior));
  }

  public meleeDefenderHandler(creepBehavior: CreepBehavior): MeleeDefenderHandler {
    return new MeleeDefenderHandler(creepBehavior);
  }

  public repairerHandler(creepBehavior: CreepBehavior): RepairerHandler {
    return new RepairerHandler(creepBehavior, this.builderHandler(creepBehavior));
  }

  public healerHandler(creepBehavior: CreepBehavior): HealerHandler {
    return new HealerHandler(creepBehavior);
  }
}
