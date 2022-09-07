import { findCachedStructurePositions } from "utils/structureUtils"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class UpgraderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.UPGRADER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn

    if (!room.memory.buildOrder) return null

    // If energy near controller or energy in controller container
    const controllerCntPositions = findCachedStructurePositions(spawn.room, STRUCTURE_CONTAINER).filter(c =>
      c.inRangeTo(spawn.room.controller!.pos, 2)
    )

    if (0 < controllerCntPositions.length) {
      const pos = new RoomPosition(controllerCntPositions[0].x, controllerCntPositions[0].y, spawn.room.name)
      const containers = spawn.room.lookForAt(LOOK_STRUCTURES, pos) as StructureContainer[]
      const energyPiles = spawn.room.lookForAt(LOOK_ENERGY, pos)

      if (0 < containers.length && containers[0].store.getUsedCapacity(RESOURCE_ENERGY) <= 0) return null
      if (containers.length <= 0 && energyPiles.length <= 0) return null
    }

    const upgraders = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    if (2 <= upgraders.length) return null

    const blueprint = [WORK]
    let body = buildCappedBodyParts(blueprint, room, 25, [CARRY])
    return new SpawnConfig(body, this.role)
  }
}
