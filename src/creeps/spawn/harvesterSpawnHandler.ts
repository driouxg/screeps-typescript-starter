import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts";

export default class HarvesterSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.HARVESTER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    const bluePrint = [WORK, WORK, CARRY, MOVE];

    if (this.creepPopulationDict[this.role] <= 4)
      return new SpawnConfig(buildDynamicBodyParts(bluePrint, room), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
