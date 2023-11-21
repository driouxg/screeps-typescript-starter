import { jsonToRoomPosition } from "utils/jsonMapper"
import {
  findContainerNextToSpawn,
  findContainersNextToSpawn,
  findPickupPosition,
  hasEnergy,
  hasMaxEnergy,
  isWorking,
  moveToWithSinglePath
} from "../common/creepBehavior"
import ICreepHandler from "./ICreepHandler"
import { BUILDER } from "creeps/roles"

/**
 * Goal: Repair structures if below 80%. Otherwise, build new structures.
 *
 * Repair target
 * IF: target can't be repaired
 * repairableTargets = getRepairable()
 *
 * IF: targets.size <= 0
 *    build()
 */
export default class BuilderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    if (creep.memory.role !== BUILDER) return

    if (isWorking(creep)) this.workUntilNoEnergy(creep)
    // else harvestUntilMaxEnergy(creep, this.creepEnergyRetrieval)
    else {
      if (hasMaxEnergy(creep)) creep.memory.working = true

      let memory = creep.memory as BuilderMemory

      memory.pickupTargetPos = memory.pickupTargetPos || findContainerNextToSpawn(creep)

      if (!memory.pickupTargetPos) return

      const targetPos = jsonToRoomPosition(memory.pickupTargetPos)
      const structures = creep.room.lookForAt(LOOK_STRUCTURES, targetPos)

      if (0 < structures.length) {
        // Withdraw from structure
        if (creep.withdraw(structures[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
          memory.pickupTargetPos = findPickupPosition(creep)
        else moveToWithSinglePath(creep, targetPos)
      } else {
        // Pickup at location
        const energyPiles = creep.room.lookForAt(LOOK_ENERGY, targetPos)
        if (energyPiles.length <= 0) memory.pickupTargetPos = findContainerNextToSpawn(creep)!
        if (creep.pickup(energyPiles[0]) !== ERR_NOT_IN_RANGE) memory.pickupTargetPos = findContainerNextToSpawn(creep)!
        else moveToWithSinglePath(creep, targetPos)
      }
    }
  }

  private workUntilNoEnergy(creep: Creep) {
    let memory = creep.memory as BuilderMemory
    memory.buildTargetPos = memory.buildTargetPos ?? { x: 0, y: 0, roomName: creep.room.name }
    memory.repairTargetPos = memory.repairTargetPos ?? { x: 0, y: 0, roomName: creep.room.name }

    if (hasEnergy(creep)) {
      this.repair(creep)
    } else memory.working = false
  }

  private build(creep: Creep) {
    let memory = creep.memory as BuilderMemory

    const constructionSites = jsonToRoomPosition(memory.buildTargetPos).lookFor(LOOK_CONSTRUCTION_SITES)

    if (constructionSites.length <= 0 || creep.build(constructionSites[0]) === ERR_INVALID_TARGET) {
      memory.buildTargetPos = this.findNewTargetConstructionSite(creep)
    }

    const buildCode = creep.build(constructionSites[0])
    if (buildCode === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, constructionSites[0].pos)
  }

  private findNewTargetConstructionSite(creep: Creep): RoomPosition {
    const constructionSites: ConstructionSite<BuildableStructureConstant>[] = creep.room.find(
      FIND_MY_CONSTRUCTION_SITES
    )

    if (constructionSites.length <= 0) return jsonToRoomPosition((creep.memory as BuilderMemory).buildTargetPos)

    return constructionSites[0].pos
  }

  private repair(creep: Creep) {
    let memory = creep.memory as BuilderMemory

    const structures = jsonToRoomPosition(memory.repairTargetPos).lookFor(LOOK_STRUCTURES)

    if (
      structures.length <= 0 ||
      creep.repair(structures[0]) === ERR_INVALID_TARGET ||
      this.isStructureFullHealth(structures[0])
    ) {
      const repairableStructures = this.getRepairableStructures(creep)

      if (repairableStructures.length <= 0) return this.build(creep)

      memory.repairTargetPos = repairableStructures[0].pos
    }

    if (creep.repair(structures[0]) === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, structures[0].pos)
  }

  private getRepairableStructures = (creep: Creep): AnyStructure[] =>
    creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType !== STRUCTURE_RAMPART && this.isStructureLowHits(s)
    })

  private isStructureLowHits(s: AnyStructure) {
    return s.hits < s.hitsMax * 0.8
  }

  private isStructureFullHealth(s: Structure<StructureConstant>) {
    return s.hits === s.hitsMax
  }
}

export interface BuilderMemory extends CreepMemory {
  repairTargetPos: { x: number; y: number; roomName: string }
  buildTargetPos: { x: number; y: number; roomName: string }
  pickupTargetPos: { x: number; y: number; roomName: string }
}
