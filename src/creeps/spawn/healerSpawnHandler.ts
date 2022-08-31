import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class HealerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }
  private spawn: StructureSpawn
  private role: string = creepRoles.HEALER

  public constructor(creepPopulationDict: { [key: string]: number }, spawn: StructureSpawn) {
    this.creepPopulationDict = creepPopulationDict
    this.spawn = spawn
  }

  public spawnCreep(room: Room): SpawnConfig | null {
    const enemies: Creep[] = this.spawn.room.find(FIND_HOSTILE_CREEPS)

    if (this.creepPopulationDict[this.role] < Math.ceil(enemies.length / 2))
      return new SpawnConfig(buildDynamicBodyParts([TOUGH, MOVE, HEAL], room), this.role)
    else return null
  }
}
