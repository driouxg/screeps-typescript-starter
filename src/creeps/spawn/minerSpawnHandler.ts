import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class MinerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MINER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const miners = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    if (miners.length < spawn.room.find(FIND_SOURCES).length) {
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, WORK, WORK, WORK], spawn.room, 5), this.role)
    } else return null
  }
}
