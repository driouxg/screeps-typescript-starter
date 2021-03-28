import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import * as creepRoles from "../roles";
import { buildCappedBodyParts } from "./utils/dynamicBodyParts";

export default class MinerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private spawn: StructureSpawn;
  private role: string = creepRoles.MINER;

  public constructor(
    creepPopulationDict: { [key: string]: number },
    nextSpawnHandler: ISpawnHandler,
    spawn: StructureSpawn
  ) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
    this.spawn = spawn;
  }

  spawnCreep(room: Room): SpawnConfig {
    if (this.creepPopulationDict[this.role] < this.spawn.room.find(FIND_SOURCES).length) {
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, WORK, WORK, WORK], room, 5), this.role);
    } else return this.nextSpawnHandler.spawnCreep(room);
  }
}
