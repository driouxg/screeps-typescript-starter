import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class HarvesterSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.HARVESTER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    const bodyParts = [WORK, WORK, CARRY, MOVE];
    let parts: BodyPartConstant[] = [];
    let cost = 0,
      idx = 0;

    while (cost + BODYPART_COST[bodyParts[idx]] < room.energyAvailable) {
      parts.push(bodyParts[idx]);
      cost += BODYPART_COST[bodyParts[idx]];
      idx = (idx + 1) % bodyParts.length;
    }

    if (this.creepPopulationDict[this.role] <= 4) return new SpawnConfig(parts, this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
