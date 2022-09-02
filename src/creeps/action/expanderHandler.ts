import { jsonToRoomPosition } from "utils/jsonMapper"
import { hasEnergy, hasMaxEnergy, isWorking, moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Go to target room. Harvest and complete construction site.
 */
export default class ExpanderHandler implements ICreepHandler {
  handle(creep: Creep): void {
    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else this.harvestUntilMaxEnergy(creep)
  }

  private workUntilNoEnergy(creep: Creep) {
    const memory = creep.memory as ExpanderMemory

    if (hasEnergy(creep)) {
      const spawnPos = jsonToRoomPosition(memory.targetSpawnPos)
      const constructionSites = creep.room
        .lookForAt(LOOK_CONSTRUCTION_SITES, spawnPos)
        .filter(c => c.structureType === STRUCTURE_SPAWN)

      if (constructionSites.length <= 0) creep.suicide()
      if (creep.build(constructionSites[0]) === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, spawnPos)
    } else memory.working = false
  }

  private harvestUntilMaxEnergy(creep: Creep) {
    const memory = creep.memory as ExpanderMemory
    const targetPos = jsonToRoomPosition(memory.targetSpawnPos)

    if (creep.room.name === targetPos.roomName) {
      if (hasMaxEnergy(creep)) memory.working = true
      if (memory.targetSourceId) {
        const source = Game.getObjectById(memory.targetSourceId) as Source
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, source.pos)
      } else memory.targetSourceId = creep.room.find(FIND_SOURCES)[0].id
    } else moveToWithSinglePath(creep, targetPos)
  }
}

export interface ExpanderMemory extends CreepMemory {
  targetSourceId: string
  targetSpawnPos: { x: number; y: number; roomName: string }
}
