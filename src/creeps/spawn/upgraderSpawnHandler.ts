import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts";

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.UPGRADER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    if (this.creepPopulationDict[this.role] < 1) {
      const bodyParts = buildDynamicBodyParts([WORK, WORK, WORK], room, [CARRY]);
      return new SpawnConfig(bodyParts, this.role);
    } else return this.nextSpawnHandler.spawnCreep(room);
  }
}
