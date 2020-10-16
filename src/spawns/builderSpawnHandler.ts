import * as creepRoles from "../creeps/roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class BuilderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(): SpawnConfig {
    if (this.creepPopulationDict[creepRoles.BUILDER] < 2)
      return new SpawnConfig([WORK, WORK, CARRY, MOVE], creepRoles.BUILDER);
    else return this.nextSpawnHandler.spawnCreep();
  }
}
