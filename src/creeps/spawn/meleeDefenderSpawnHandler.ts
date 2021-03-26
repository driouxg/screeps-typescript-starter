import * as creepRoles from "../roles";
import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";

export default class MeleeDefenderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private spawn: StructureSpawn;
  private role: string = creepRoles.MELEE_DEFENDER;

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
      return new SpawnConfig([TOUGH, TOUGH, ATTACK, MOVE], this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }
}
