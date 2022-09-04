import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.UPGRADER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn

    const upgraders = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    if (0 < upgraders.length) return null

    const blueprint = [WORK]
    let body = buildCappedBodyParts(blueprint, room, 25, [CARRY])
    return new SpawnConfig(body, this.role)
  }
}
