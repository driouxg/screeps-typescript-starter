import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class RepairerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }
  private role: string = creepRoles.REPAIRER

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(room: Room): SpawnConfig | null {
    if (Game.time % 100 !== 0) return null

    if (this.creepPopulationDict[this.role] < 1)
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], room, 20), this.role)
    else return null
  }
}
