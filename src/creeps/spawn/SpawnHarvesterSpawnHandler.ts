import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import * as creepRoles from "../roles";

export default class SpawnHarvesterSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.SPAWN_HARVESTER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    if (this.creepPopulationDict[this.role] < 0) return new SpawnConfig([WORK, WORK, CARRY, MOVE], this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
