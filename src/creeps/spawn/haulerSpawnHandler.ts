import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

import * as creepRoles from "../roles";
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts";

export default class HaulerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.HAULER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  spawnCreep(room: Room): SpawnConfig {
    if (0 < this.creepPopulationDict[this.role] && room.energyAvailable !== room.energyCapacityAvailable)
      return this.nextSpawnHandler.spawnCreep(room);
    const bluePrint = [CARRY, MOVE, CARRY, MOVE];

    if (this.creepPopulationDict[this.role] < this.creepPopulationDict[creepRoles.MINER] * 2)
      return new SpawnConfig(buildDynamicBodyParts(bluePrint, room), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
