import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class BuilderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.BUILDER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (spawn.room.energyAvailable !== spawn.room.energyCapacityAvailable || !this.isHundredthTick()) return null

    const constructionSites = spawn.room.find(FIND_MY_CONSTRUCTION_SITES)

    if (constructionSites.length <= 0) return null

    const numCreeps = spawn.room.find(FIND_SOURCES).length * 4

    const builders = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.BUILDER })

    if (numCreeps <= builders.length) return null

    return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], spawn.room, 20), this.role)
  }

  private isHundredthTick(): boolean {
    return Game.time % 100 === 0
  }
}
