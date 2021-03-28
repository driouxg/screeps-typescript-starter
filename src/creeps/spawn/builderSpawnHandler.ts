import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts";

export default class BuilderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.BUILDER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    if (this.creepPopulationDict[this.role] < 1 && 0 < room.find(FIND_MY_CONSTRUCTION_SITES).length)
      return new SpawnConfig(buildDynamicBodyParts([WORK, WORK, CARRY, MOVE], room), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
