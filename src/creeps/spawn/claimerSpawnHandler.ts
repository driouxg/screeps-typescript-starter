import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

export default class ClaimerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (!this.isThousandthTick()) return null

    if (this.creepPopulationDict[creepRoles.CLAIMER] < 1)
      return new SpawnConfig([MOVE, MOVE, CLAIM], creepRoles.CLAIMER)
    else return null
  }

  private isThousandthTick(): boolean {
    return Game.time % 1000 === 0
  }
}
