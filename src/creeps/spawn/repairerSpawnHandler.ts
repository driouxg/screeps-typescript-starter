import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildCappedBodyParts } from "./utils/dynamicBodyParts";

export default class RepairerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.REPAIRER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    if (Game.time % 100 !== 0) return this.nextSpawnHandler.spawnCreep(room);

    if (this.creepPopulationDict[this.role] < 1)
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], room, 20), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
