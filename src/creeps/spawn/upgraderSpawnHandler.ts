import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }
  private role: string = creepRoles.UPGRADER

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(room: Room): SpawnConfig | null {
    if (room.energyAvailable !== room.energyCapacityAvailable) return null

    if (this.creepPopulationDict[this.role] < 1) {
      const bodyParts = buildDynamicBodyParts([WORK, WORK, WORK], room, [CARRY])
      return new SpawnConfig(bodyParts, this.role)
    } else return null
  }
}
