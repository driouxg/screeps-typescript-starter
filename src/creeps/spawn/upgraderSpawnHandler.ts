import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts, buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.UPGRADER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (room.energyAvailable !== room.energyCapacityAvailable) return null

    const upgraders = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    if (0 < upgraders.length) return null

    const body = buildCappedBodyParts([WORK, WORK, WORK], room, 25)
    body.push(CARRY)
    return new SpawnConfig(body, this.role)
  }
}
