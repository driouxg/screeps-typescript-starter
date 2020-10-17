import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.UPGRADER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(): SpawnConfig {
    if (this.creepPopulationDict[this.role] < 3) return new SpawnConfig([WORK, CARRY, MOVE, MOVE], this.role);
    else return this.nextSpawnHandler.spawnCreep();
  }
}
