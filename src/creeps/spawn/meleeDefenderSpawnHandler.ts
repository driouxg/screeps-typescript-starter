import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class MeleeDefenderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MELEE_DEFENDER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const enemies = spawn.room.find(FIND_HOSTILE_CREEPS, { filter: c => 0 < c.getActiveBodyparts(ATTACK) })

    if (enemies.length < Math.ceil(enemies.length / 2))
      return new SpawnConfig(buildDynamicBodyParts([TOUGH, TOUGH, ATTACK, MOVE], spawn.room), this.role)
    else return null
  }
}
