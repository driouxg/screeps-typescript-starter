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
    const bluePrint = [CARRY, CARRY, MOVE, MOVE];

    if (this.creepPopulationDict[this.role] <= 4)
      return new SpawnConfig(buildDynamicBodyParts(bluePrint, room), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
