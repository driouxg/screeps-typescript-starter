import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import * as creepRoles from "../roles";

export default class PullerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.PULLER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  spawnCreep(room: Room): SpawnConfig {
    const bluePrint = [MOVE, MOVE, MOVE];

    if (this.creepPopulationDict[this.role] < 1) return new SpawnConfig(bluePrint, this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
