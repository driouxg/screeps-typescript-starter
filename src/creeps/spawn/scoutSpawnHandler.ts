import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"

export default class ScoutSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  spawnCreep(room: Room): SpawnConfig | null {
    if (this.creepPopulationDict[creepRoles.SCOUT] < 1) return new SpawnConfig([MOVE, MOVE, MOVE], creepRoles.SCOUT)

    return null
  }
}
