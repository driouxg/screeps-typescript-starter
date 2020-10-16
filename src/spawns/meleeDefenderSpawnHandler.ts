import * as creepRoles from "../creeps/roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class MeleeDefenderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private spawn: StructureSpawn;

  public constructor(
    creepPopulationDict: { [key: string]: number },
    nextSpawnHandler: ISpawnHandler,
    spawn: StructureSpawn
  ) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
    this.spawn = spawn;
  }

  public spawnCreep(): SpawnConfig {
    const enemies: Creep[] = this.spawn.room.find(FIND_HOSTILE_CREEPS);

    if (this.creepPopulationDict[creepRoles.MELEE_DEFENDER] < Math.ceil(enemies.length / 2))
      return new SpawnConfig([TOUGH, TOUGH, ATTACK, MOVE], creepRoles.MELEE_DEFENDER);
    else return this.nextSpawnHandler.spawnCreep();
  }
}
