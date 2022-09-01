import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"

export default class ScoutSpawnHandler implements ISpawnHandler {
  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const memory = spawn.memory

    memory.scoutLastSpawned = memory.scoutLastSpawned ?? 0
    if (Game.time <= memory.scoutLastSpawned + CREEP_LIFE_TIME) return null

    memory.scoutLastSpawned = Game.time
    return new SpawnConfig([MOVE, MOVE, MOVE], creepRoles.SCOUT)
  }
}
