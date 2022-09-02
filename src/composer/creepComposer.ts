import * as creepRoles from "../creeps/roles"
import BuilderHandler from "creeps/action/builderHandler"
import HealerHandler from "creeps/action/healerHandler"
import ICreepHandler from "creeps/action/ICreepHandler"
import MeleeDefenderHandler from "creeps/action/meleeDefenderHandler"
import UpgraderHandler from "creeps/action/upgraderHandler"
import MinerHandler from "creeps/action/minerHandler"
import PullerHandler from "creeps/action/pullerHandler"
import HaulerHandler from "creeps/action/haulerHandler"
import ScoutHandler from "creeps/action/scoutHandler"
import ClaimerHandler from "creeps/action/claimerHandler"
import WatcherHandler from "creeps/action/watcherHandler"
import RemoteMinerHandler from "creeps/action/remoteMinerHandler"
import ExpanderHandler from "creeps/action/expanderHandler"

export default class CreepComposer {
  public creepHandlerDict(): { [creepRole: string]: ICreepHandler } {
    const dictionary: { [creepRole: string]: ICreepHandler } = {}
    dictionary[creepRoles.UPGRADER] = new UpgraderHandler()
    dictionary[creepRoles.BUILDER] = new BuilderHandler()
    dictionary[creepRoles.MELEE_DEFENDER] = new MeleeDefenderHandler()
    dictionary[creepRoles.HEALER] = new HealerHandler()
    dictionary[creepRoles.MINER] = new MinerHandler()
    dictionary[creepRoles.PULLER] = new PullerHandler()
    dictionary[creepRoles.HAULER] = new HaulerHandler()
    dictionary[creepRoles.SCOUT] = new ScoutHandler()
    dictionary[creepRoles.CLAIMER] = new ClaimerHandler()
    dictionary[creepRoles.WATCHER] = new WatcherHandler()
    dictionary[creepRoles.REMOTE_MINER] = new RemoteMinerHandler()
    dictionary[creepRoles.EXPANDER] = new ExpanderHandler()

    return dictionary
  }
}
