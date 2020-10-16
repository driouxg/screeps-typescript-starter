import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(): SpawnConfig {
    if (this.creepPopulationDict[creepRoles.UPGRADER] < 3)
      return new SpawnConfig([WORK, CARRY, MOVE, MOVE], creepRoles.UPGRADER);
    else return this.nextSpawnHandler.spawnCreep();
  }
}
