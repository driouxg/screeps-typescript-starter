import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildCappedBodyParts } from "./utils/dynamicBodyParts";

export default class BuilderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.BUILDER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  public spawnCreep(room: Room): SpawnConfig {
    if (room.energyAvailable !== room.energyCapacityAvailable || !this.isHundredthTick())
      return this.nextSpawnHandler.spawnCreep(room);

    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);

    const numCreeps = 0 < constructionSites.filter(c => c.structureType !== STRUCTURE_ROAD).length ? 2 : 1;

    if (this.creepPopulationDict[this.role] < numCreeps && 0 < constructionSites.length)
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], room, 20), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }

  private isHundredthTick(): boolean {
    return Game.time % 100 === 0;
  }
}
