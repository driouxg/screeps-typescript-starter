import * as creepRoles from "../creeps/roles";
import BuilderHandler from "creeps/action/builder/builderHandler";
import CreepBehavior from "creeps/action/common/creepBehavior";
import HarvesterHandler from "creeps/action/harvester/harvesterHandler";
import HealerHandler from "creeps/action/healerHandler";
import ICreepHandler from "creeps/action/ICreepHandler";
import MeleeDefenderHandler from "creeps/action/meleeDefenderHandler";
import RepairerHandler from "creeps/action/repairerHandler";
import UpgraderHandler from "creeps/action/upgraderHandler";
import StructureEnergyCollector from "creeps/action/common/structureEnergyHarvester";
import NearbySourceEnergyHarvester from "creeps/action/common/NearbySourceEnergyHarvester";

export default class CreepComposer {
  public creepHandlerDict(): { [creepRole: string]: ICreepHandler } {
    const structureCreepBehavior = new CreepBehavior(new StructureEnergyCollector());
    const nearbySourceCreepBehavior = new CreepBehavior(new NearbySourceEnergyHarvester());

    const dictionary: { [creepRole: string]: ICreepHandler } = {};
    dictionary[creepRoles.HARVESTER] = this.harvesterHandler(nearbySourceCreepBehavior);
    dictionary[creepRoles.UPGRADER] = this.upgraderHandler(structureCreepBehavior);
    dictionary[creepRoles.BUILDER] = this.builderHandler(structureCreepBehavior);
    dictionary[creepRoles.MELEE_DEFENDER] = this.meleeDefenderHandler(structureCreepBehavior);
    dictionary[creepRoles.REPAIRER] = this.repairerHandler(structureCreepBehavior);
    dictionary[creepRoles.HEALER] = this.healerHandler(structureCreepBehavior);

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
