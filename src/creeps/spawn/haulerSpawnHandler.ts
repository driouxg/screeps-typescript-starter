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

  spawnCreep(room: Room): SpawnConfig | null {
    if (0 < this.creepPopulationDict[this.role] && room.energyAvailable !== room.energyCapacityAvailable) return null
    const bluePrint = [CARRY, MOVE, CARRY, MOVE]

    if (this.creepPopulationDict[this.role] < this.creepPopulationDict[creepRoles.MINER] * 2)
      return new SpawnConfig(buildCappedBodyParts(bluePrint, room, 25), this.role)
    else return null
  }
}
