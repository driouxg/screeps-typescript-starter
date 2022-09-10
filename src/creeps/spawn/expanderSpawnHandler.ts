import { myClaimedRoom } from "main"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import * as creepRoles from "../roles"
import { ExpanderMemory } from "creeps/action/expanderHandler"

export default class ExpanderSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    for (let roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!room) continue
      if (!myClaimedRoom(room)) continue
      if (2 <= this.creepPopulationDict[creepRoles.EXPANDER]) return null

      const myConstructionSites = room.find(FIND_CONSTRUCTION_SITES, {
        filter: c => c.owner.username === "DryOx" && c.structureType === STRUCTURE_SPAWN
      })

      if (myConstructionSites.length <= 0) continue

      const { x, y, roomName: name } = myConstructionSites[0].pos
      const blueprint = [WORK, CARRY, MOVE]
      return new SpawnConfig(buildCappedBodyParts(blueprint, spawn.room, 25), creepRoles.EXPANDER, {
        memory: {
          targetSpawnPos: { x, y, roomName: name }
        } as ExpanderMemory
      })
    }

    return null
  }
}
