import { jsonToRoomPosition } from "utils/jsonMapper"
import ICreepHandler from "./ICreepHandler"
import { moveToWithSinglePath } from "creeps/common/creepBehavior"
import { dirs, isBuildablePos, isWall } from "utils/roomUtils"
import { PULLER, UPGRADER } from "creeps/roles"

export default class UpgraderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    if (creep.memory.role !== UPGRADER) return

    const controller: StructureController | undefined = creep.room.controller
    if (!controller) return

    let memory = creep.memory as UpgraderMemory
    memory.targetPos = memory.targetPos || (this.findTargetRoomPosition(creep, controller) as RoomPosition)
    let targetPos = jsonToRoomPosition(memory.targetPos)

    const creepsInSpot = creep.room.lookForAt(LOOK_CREEPS, targetPos)
    if (0 < creepsInSpot.length && creepsInSpot[0].name !== creep.name && creepsInSpot[0].memory.role !== PULLER) {
      memory.targetPos = this.findTargetRoomPosition(creep, controller) as RoomPosition
    }

    if (!creep.pos.isEqualTo(targetPos.x, targetPos.y)) {
      moveToWithSinglePath(creep, targetPos)
      return
    }
    this.collectEnergy(creep)
    creep.upgradeController(controller)
  }

  private collectEnergy(creep: Creep): void {
    const containerPos = this.findContainerPosition(creep)

    if (!containerPos) return

    const energyPiles = creep.room.lookForAt(LOOK_ENERGY, containerPos.x, containerPos.y)
    if (0 < energyPiles.length) {
      creep.pickup(energyPiles[0])
      return
    }

    const containers = creep.room
      .lookForAt(LOOK_STRUCTURES, containerPos.x, containerPos.y)
      .filter(s => s.structureType === STRUCTURE_CONTAINER)

    if (0 < containers.length) {
      creep.withdraw(containers[0], RESOURCE_ENERGY)
      return
    }
  }

  private findTargetRoomPosition(creep: Creep, controller: StructureController): RoomPosition {
    if (!creep.room.memory.positions) return creep.pos
    for (const dir of dirs().sort(() => Math.random() - 0.5)) {
      if (!creep.room.memory.positions || !creep.room.memory.positions[STRUCTURE_CONTAINER]) return creep.pos
      for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
        const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], creep.room.name)
        if (
          pos.inRangeTo(controller.pos.x, controller.pos.y, 3) &&
          !isWall(pos.x, pos.y, pos.roomName) &&
          isBuildablePos(pos.x, pos.y)
        ) {
          return pos
        }
      }
    }

    return creep.pos
  }

  private findContainerPosition(creep: Creep): RoomPosition | null {
    for (const pos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (creep.pos.isNearTo(jsonToRoomPosition(pos))) return jsonToRoomPosition(pos)
    }

    return null
  }
}

export interface UpgraderMemory extends CreepMemory {
  targetPos: { x: number; y: number; roomName: string }
}
