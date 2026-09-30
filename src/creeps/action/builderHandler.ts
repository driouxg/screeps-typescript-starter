import { priorityOf } from "structures/construction/buildOrderConstructor"
import { findPickupPosition } from "./common/creepBehavior"
import { clearTile, moveOffTile, smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** Don't walk to a pile or container for less than this share of our free capacity. */
const MIN_PICKUP_SHARE = 0.5
/** Leave energy near the controller for upgraders. */
const CONTROLLER_RESERVE_RANGE = 3

type EnergyTarget = Resource<RESOURCE_ENERGY> | StructureContainer | StructureStorage | Tombstone | Ruin

/**
 * Goal: Repair structures below 80%. Otherwise, build construction sites, finishing the most progressed one first.
 * With nothing to build, upgrade the controller.
 *
 * Energy comes from the closest pile, container, storage, tombstone or ruin, falling back to harvesting.
 */
export default class BuilderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as BuilderMemory

    if (memory.working && creep.store.energy <= 0) memory.working = false
    if (!memory.working && creep.store.getFreeCapacity() <= 0) {
      memory.working = true
      // Re-pick each trip so higher priority sites placed meanwhile get built first.
      memory.buildTargetId = undefined
    }

    if (memory.working) this.work(creep)
    else this.collectEnergy(creep)
  }

  private work(creep: Creep) {
    if (this.repair(creep)) return
    if (this.build(creep)) return
    this.upgrade(creep)
  }

  private repair(creep: Creep): boolean {
    const memory = creep.memory as BuilderMemory
    let target = memory.repairTargetId ? Game.getObjectById(memory.repairTargetId) : null

    if (!target || this.isFullHealth(target)) {
      target = creep.pos.findClosestByRange(this.getRepairableStructures(creep))
      memory.repairTargetId = target?.id
    }
    if (!target) return false

    if (creep.repair(target) === ERR_NOT_IN_RANGE && smartMove(creep, target, 3) === ERR_NO_PATH)
      memory.repairTargetId = undefined
    return true
  }

  private build(creep: Creep): boolean {
    const memory = creep.memory as BuilderMemory
    let site = memory.buildTargetId ? Game.getObjectById(memory.buildTargetId) : null

    if (!site) {
      site = this.findConstructionSite(creep)
      memory.buildTargetId = site?.id
    }
    if (!site) return false

    const code = creep.build(site)
    if (code === ERR_NOT_IN_RANGE) {
      if (smartMove(creep, site, 3) === ERR_NO_PATH) memory.buildTargetId = undefined
    } else if (code === ERR_INVALID_TARGET) {
      // A creep standing on the site blocks it from being built.
      moveOffTile(creep, site.pos)
      clearTile(site.pos)
    }
    return true
  }

  private upgrade(creep: Creep) {
    const controller = creep.room.controller
    if (!controller || !controller.my) return

    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 3)
  }

  /**
   * Highest build priority first (same order the build order places them), then finish what's started, then closest.
   */
  private findConstructionSite(creep: Creep): ConstructionSite | null {
    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES)
    if (sites.length <= 0) return null

    const priority = (s: ConstructionSite) => priorityOf(creep.room, s.pos, s.structureType)
    const progress = (s: ConstructionSite) => s.progress / s.progressTotal
    sites.sort(
      (a, b) =>
        priority(a) - priority(b) || progress(b) - progress(a) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b)
    )
    return sites[0]
  }

  private collectEnergy(creep: Creep) {
    const memory = creep.memory as BuilderMemory
    let target = memory.pickupTargetId ? Game.getObjectById(memory.pickupTargetId) : null

    if (!target || energyIn(target) <= 0) {
      target = this.findEnergy(creep)
      memory.pickupTargetId = target?.id
    }

    if (!target) {
      // Nothing to collect: use what we have, or harvest it ourselves.
      if (0 < creep.store.energy) memory.working = true
      else this.harvest(creep)
      return
    }

    const code = target instanceof Resource ? creep.pickup(target) : creep.withdraw(target, RESOURCE_ENERGY)
    if (code === ERR_NOT_IN_RANGE) {
      if (smartMove(creep, target, 1) === ERR_NO_PATH) memory.pickupTargetId = undefined
    } else if (code !== OK) memory.pickupTargetId = undefined
  }

  private findEnergy(creep: Creep): EnergyTarget | null {
    const minAmount = Math.max(1, creep.store.getFreeCapacity() * MIN_PICKUP_SHARE)
    const controller = creep.room.controller
    const nearController = (pos: RoomPosition) =>
      controller !== undefined && pos.inRangeTo(controller.pos, CONTROLLER_RESERVE_RANGE)

    const piles = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && minAmount <= r.amount && !nearController(r.pos)
    }) as Resource<RESOURCE_ENERGY>[]
    const stores = creep.room.find(FIND_STRUCTURES, {
      filter: s =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        minAmount <= s.store.energy &&
        !nearController(s.pos)
    }) as (StructureContainer | StructureStorage)[]
    const tombstones = creep.room.find(FIND_TOMBSTONES, { filter: t => minAmount <= t.store.energy })
    const ruins = creep.room.find(FIND_RUINS, { filter: r => minAmount <= r.store.energy })

    const candidates: EnergyTarget[] = [...piles, ...stores, ...tombstones, ...ruins]
    const closest = creep.pos.findClosestByPath(candidates, { ignoreCreeps: true })
    if (closest) return closest

    // Fall back to the source-side piles haulers use, even if they're small.
    const pickupPos = findPickupPosition(creep)
    if (!pickupPos) return null
    const pile = pickupPos.lookFor(LOOK_ENERGY)[0]
    return pile ?? null
  }

  private harvest(creep: Creep) {
    if (creep.getActiveBodyparts(WORK) <= 0) return
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { ignoreCreeps: true })
    if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, 1)
  }

  private getRepairableStructures = (creep: Creep): AnyStructure[] =>
    creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType !== STRUCTURE_RAMPART && this.isStructureLowHits(s)
    })

  private isStructureLowHits(s: AnyStructure) {
    return s.hits < s.hitsMax * 0.8
  }

  private isFullHealth(s: Structure) {
    return s.hits === s.hitsMax
  }
}

function energyIn(target: EnergyTarget): number {
  return target instanceof Resource ? target.amount : target.store.energy
}

export interface BuilderMemory extends CreepMemory {
  repairTargetId?: Id<Structure>
  buildTargetId?: Id<ConstructionSite>
  pickupTargetId?: Id<EnergyTarget>
}
