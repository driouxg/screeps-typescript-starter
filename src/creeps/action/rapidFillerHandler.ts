import { rapidFillOf } from "structures/rapidFill"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

type Fillable = StructureSpawn | StructureExtension
type Source = StructureContainer | StructureLink

/**
 * Goal: Stand on a rapid fill spot and keep the spawns and extensions around it full, so haulers only have to fill
 * the rapid fill's containers instead of walking to every extension.
 *
 * Each tick: fill an adjacent spawn/extension that needs energy, else refill from the adjacent link (so the link is
 * free to receive again) and then the container. With everything full, move link energy into the container.
 */
export default class RapidFillerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RapidFillerMemory
    const spot = memory.spot ? new RoomPosition(memory.spot.x, memory.spot.y, creep.room.name) : null
    if (!spot) return

    if (!creep.pos.isEqualTo(spot)) {
      memory.stationary = false
      smartMove(creep, spot, 0)
      return
    }
    memory.stationary = true

    const needy = creep.pos
      .findInRange(FIND_MY_STRUCTURES, 1, {
        filter: s =>
          (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
          0 < s.store.getFreeCapacity(RESOURCE_ENERGY)
      })
      .sort((a, b) => a.structureType.localeCompare(b.structureType))[0] as Fillable | undefined
    const { link, container } = this.sources(creep)

    if (needy && 0 < creep.store.energy) {
      creep.transfer(needy, RESOURCE_ENERGY)
      return
    }

    if (0 < creep.store.getFreeCapacity()) {
      const from = link && 0 < link.store.energy ? link : container && 0 < container.store.energy ? container : null
      if (from) creep.withdraw(from, RESOURCE_ENERGY)
      return
    }

    // Full, and nothing to fill: keep the link empty so it can receive more.
    if (link && 0 < link.store.energy && container && 0 < container.store.getFreeCapacity(RESOURCE_ENERGY))
      creep.transfer(container, RESOURCE_ENERGY)
  }

  private sources(creep: Creep): { link?: StructureLink; container?: StructureContainer } {
    const rapidFill = rapidFillOf(creep.room)
    const near = creep.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: s => s.structureType === STRUCTURE_LINK || s.structureType === STRUCTURE_CONTAINER
    }) as Source[]
    const inStamp = (s: Source) => !rapidFill || rapidFill.center.inRangeTo(s, 2)
    return {
      link: near.find(s => s.structureType === STRUCTURE_LINK && inStamp(s)) as StructureLink | undefined,
      container: near.find(s => s.structureType === STRUCTURE_CONTAINER && inStamp(s)) as StructureContainer | undefined
    }
  }
}

export interface RapidFillerMemory extends CreepMemory {
  spot?: { x: number; y: number }
}
