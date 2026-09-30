import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class HealerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.HEALER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const enemies = spawn.room.find(FIND_HOSTILE_CREEPS, { filter: c => 0 < c.getActiveBodyparts(ATTACK) })
    const healers = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    // A healer only helps if there are defenders to keep alive.
    const defenders = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.MELEE_DEFENDER })

    // ...and not during safe mode, when hostiles can't hurt anyone.
    if (spawn.room.controller?.safeMode) return null

    if (0 < enemies.length && 0 < defenders.length && healers.length <= 0)
      return new SpawnConfig(buildDynamicBodyParts([TOUGH, MOVE, HEAL], spawn.room), this.role)
    else return null
  }
}
