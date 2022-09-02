import HaulerMemory from "creeps/memory/haulerMemory"
import {
  findCachedStructurePositions,
  findContainers,
  findExtensions,
  findStorage,
  findTowers
} from "utils/structureUtils"
import { harvestUntilMaxEnergy, hasEnergy, isWorking, updateWorkingState } from "./common/creepBehavior"
import ICreepEnergyRetrieval from "./common/ICreepEnergyRetrieval"
import StructureEnergyCollector from "./common/structureEnergyHarvester"
import ICreepHandler from "./ICreepHandler"

export default class HaulerHandler implements ICreepHandler {
  private creepEnergyRetrieval: ICreepEnergyRetrieval

  public constructor() {
    this.creepEnergyRetrieval = new StructureEnergyCollector()
  }

  handle(creep: Creep): void {
    updateWorkingState(creep)
    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    else harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
  }

  private workUntilNoEnergy(creep: Creep) {
    let memory = creep.memory as HaulerMemory
    memory.offloadTargetPos = memory.offloadTargetPos ?? creep.pos

    if (hasEnergy(creep)) {
      const offloadSpot = this.findOffloadSpot(creep)

      memory.offloadTargetPos = offloadSpot

      if (creep.pos.isNearTo(offloadSpot)) {
        const offloadStructure = creep.room.lookForAt(LOOK_STRUCTURES, offloadSpot)

        if (0 < offloadStructure.length) creep.transfer(offloadStructure[0], RESOURCE_ENERGY)
        else creep.drop(RESOURCE_ENERGY)
      } else creep.moveTo(offloadSpot)
    } else memory.working = false
  }

  private findOffloadSpot(creep: Creep): RoomPosition {
    // offload to extensions
    const extensions = findExtensions(creep.room).filter(e => 0 < e.store.getFreeCapacity(RESOURCE_ENERGY))
    if (0 < extensions.length) {
      extensions.sort(
        (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
      )
      return extensions[0].pos
    }

    // offload to spawns
    const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
    if (0 < spawns.length) {
      return spawns[0].pos
    }

    // offload to towers
    const towers = findTowers(creep.room).filter(t => 0 < t.store.getFreeCapacity(RESOURCE_ENERGY))
    if (0 < towers.length) {
      return towers[0].pos
    }

    // offload to controller container
    const containers = findContainers(creep.room).filter(c => c.pos.inRangeTo(creep.room.controller!.pos, 2))
    if (0 < containers.length && containers[0].store.energy <= 1500) return containers[0].pos

    // offload to containers positions that are not next to sources until we reach max container amount
    const containerPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(
      c => !this.isPositionNextToSource(creep, c)
    )

    if (0 < containerPositions.length) {
      const pos = new RoomPosition(containerPositions[0].x, containerPositions[0].y, creep.room.name)
      const containers = creep.room.lookForAt(LOOK_STRUCTURES, pos) as StructureContainer[]
      const energyPiles = creep.room.lookForAt(LOOK_ENERGY, pos)

      if (
        (0 < containers.length && containers[0].store.energy < containers[0].store.getCapacity(RESOURCE_ENERGY)) ||
        energyPiles.length <= 0 ||
        energyPiles[0].amount < 2000
      ) {
        return containerPositions[0]
      }
    }

    // offload to storage
    const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
    if (0 < storage.length) {
      return storage[0].pos
    }

    return creep.pos
  }

  private isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
    const sources = creep.room.find(FIND_SOURCES)

    for (const source of sources) {
      if (source.pos.isNearTo(pos.x, pos.y)) return true
    }
    return false
  }
}
