import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class MinerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }
  private spawn: StructureSpawn
  private role: string = creepRoles.MINER

  public constructor(creepPopulationDict: { [key: string]: number }, spawn: StructureSpawn) {
    this.creepPopulationDict = creepPopulationDict
    this.spawn = spawn
  }

  spawnCreep(room: Room): SpawnConfig | null {
    if (this.creepPopulationDict[this.role] < this.spawn.room.find(FIND_SOURCES).length) {
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, WORK, WORK, WORK], room, 5), this.role)
    } else return null
  }
}
