import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class HealerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }
  private role: string = creepRoles.HEALER

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const enemies: Creep[] = spawn.room.find(FIND_HOSTILE_CREEPS)

    if (this.creepPopulationDict[this.role] < Math.ceil(enemies.length / 2))
      return new SpawnConfig(buildDynamicBodyParts([TOUGH, MOVE, HEAL], spawn.room), this.role)
    else return null
  }
}
