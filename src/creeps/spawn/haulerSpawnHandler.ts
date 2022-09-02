import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class HaulerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  private role: string = creepRoles.HAULER

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (0 < this.creepPopulationDict[this.role] && spawn.room.energyAvailable !== spawn.room.energyCapacityAvailable)
      return null
    const bluePrint = [CARRY, MOVE, CARRY, MOVE]

    if (this.creepPopulationDict[this.role] < this.creepPopulationDict[creepRoles.MINER] * 2)
      return new SpawnConfig(buildCappedBodyParts(bluePrint, spawn.room, 25), this.role)
    else return null
  }
}
