import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts";

export default class HealerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private spawn: StructureSpawn;
  private role: string = creepRoles.HEALER;

  public constructor(
    creepPopulationDict: { [key: string]: number },
    nextSpawnHandler: ISpawnHandler,
    spawn: StructureSpawn
  ) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
    this.spawn = spawn;
  }

  public spawnCreep(room: Room): SpawnConfig {
    const enemies: Creep[] = this.spawn.room.find(FIND_HOSTILE_CREEPS);

    if (this.creepPopulationDict[this.role] < Math.ceil(enemies.length / 2))
      return new SpawnConfig(buildDynamicBodyParts([TOUGH, MOVE, HEAL], room), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
