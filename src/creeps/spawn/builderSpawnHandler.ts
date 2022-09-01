import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class BuilderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  private role: string = creepRoles.BUILDER

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(room: Room): SpawnConfig | null {
    if (room.energyAvailable !== room.energyCapacityAvailable || !this.isHundredthTick()) return null

    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)

    const numCreeps = 0 < constructionSites.filter(c => c.structureType !== STRUCTURE_ROAD).length ? 2 : 1

    if (this.creepPopulationDict[this.role] < numCreeps)
      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], room, 20), this.role)
    else return null
  }

  private isHundredthTick(): boolean {
    return Game.time % 100 === 0
  }
}
