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
import ExpanderHandler from "creeps/action/expanderHandler"
import RemoteMinerHandler from "creeps/action/remoteDropMinerHandler"
import HighwayMaintainerHandler from "creeps/action/highwayMaintainerHandler"
import RemoteHaulerHandler from "creeps/action/remoteHaulerHandler"
import RapidFillerHandler from "creeps/action/rapidFillerHandler"
import ReserverHandler from "creeps/action/reserverHandler"

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
    dictionary[creepRoles.EXPANDER] = new ExpanderHandler()
    dictionary[creepRoles.REMOTE_DROP_MINER] = new RemoteMinerHandler()
    dictionary[creepRoles.HIGHWAY_MAINTAINER] = new HighwayMaintainerHandler()
    dictionary[creepRoles.REMOTE_HAULER] = new RemoteHaulerHandler()
    dictionary[creepRoles.RAPID_FILLER] = new RapidFillerHandler()
    dictionary[creepRoles.RESERVER] = new ReserverHandler()

    return dictionary
  }
}
