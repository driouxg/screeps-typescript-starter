import PullRequestEvent from "room/pullRequestEvent"
import { isRoomPositionJson, jsonToRoomPosition } from "utils/jsonMapper"
import { isStandable } from "utils/standable"
import ICreepHandler from "./ICreepHandler"
import * as creepRoles from "../roles"

/**
 * Goal: Stand next to the controller container (within upgrade range of the controller), take energy from it and
 * upgrade. Upgraders have no MOVE parts, so a puller brings them to their spot.
 *
 * The spot must be a tile a creep can stand on for good (see isStandable): a structure built, being built or planned
 * there would leave the puller trying forever. The spot is re-picked if that changes, or if another creep holds it.
 */
export default class UpgraderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const controller = creep.room.controller
    if (!controller) return

    const memory = creep.memory as UpgraderMemory
    const current = isRoomPositionJson(memory.targetPos) ? jsonToRoomPosition(memory.targetPos) : null
    if (!current || !this.isGoodSpot(creep, current)) {
      const spot = this.findSpot(creep, controller)
      memory.targetPos = spot ? { x: spot.x, y: spot.y, roomName: spot.roomName } : undefined
    }
    if (!memory.targetPos) {
      // No spot free: upgrade from wherever we are if in range, otherwise wait for one to free up.
      creep.upgradeController(controller)
      return
    }

    const targetPos = jsonToRoomPosition(memory.targetPos)
    if (!creep.pos.isEqualTo(targetPos)) {
      creep.room.memory.events.push(new PullRequestEvent(targetPos, creep.name))
      return
    }
    this.collectEnergy(creep)
    creep.upgradeController(controller)
  }

  /** Still standable, and not taken by another creep (a puller passing through is fine). */
  private isGoodSpot(creep: Creep, pos: RoomPosition): boolean {
    if (!isStandable(creep.room, pos.x, pos.y)) return false
    const occupant = pos.lookFor(LOOK_CREEPS)[0]
    return !occupant || occupant.id === creep.id || occupant.memory.role === creepRoles.PULLER
  }

  /**
   * A standable tile next to a controller container and within range 3 of the controller, that no other upgrader
   * has claimed or stands on; closest to the creep first.
   */
  private findSpot(creep: Creep, controller: StructureController): RoomPosition | null {
    const room = creep.room
    const claimed = new Set(
      room
        .find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.UPGRADER && c.id !== creep.id })
        .map(c => (c.memory as UpgraderMemory).targetPos)
        .filter(isRoomPositionJson)
        .map(p => `${p.x},${p.y}`)
    )

    const candidates = upgraderSpots(room, controller).filter(
      p => !claimed.has(`${p.x},${p.y}`) && this.isGoodSpot(creep, p)
    )
    return creep.pos.findClosestByRange(candidates)
  }

  private collectEnergy(creep: Creep): void {
    const containerPos = controllerContainers(creep.room, creep.room.controller!).find(p => creep.pos.isNearTo(p))
    if (!containerPos) return

    const pile = creep.room.lookForAt(LOOK_ENERGY, containerPos)[0]
    if (pile) {
      creep.pickup(pile)
      return
    }
    const container = creep.room
      .lookForAt(LOOK_STRUCTURES, containerPos)
      .find(s => s.structureType === STRUCTURE_CONTAINER)
    if (container) creep.withdraw(container, RESOURCE_ENERGY)
  }
}

function controllerContainers(room: Room, controller: StructureController): RoomPosition[] {
  return (room.memory.positions?.[STRUCTURE_CONTAINER] ?? [])
    .map(p => jsonToRoomPosition(p))
    .filter(p => p.inRangeTo(controller.pos, 2))
}

/**
 * Tiles upgraders can work from: standable (see isStandable), next to a controller container and within range 3 of
 * the controller. Also caps how many upgraders are worth spawning.
 */
export function upgraderSpots(room: Room, controller: StructureController): RoomPosition[] {
  const spots = new Map<string, RoomPosition>()
  for (const container of controllerContainers(room, controller))
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = container.x + dx
        const y = container.y + dy
        if ((dx === 0 && dy === 0) || !controller.pos.inRangeTo(x, y, 3) || !isStandable(room, x, y)) continue
        spots.set(`${x},${y}`, new RoomPosition(x, y, room.name))
      }
  return [...spots.values()]
}

export interface UpgraderMemory extends CreepMemory {
  targetPos?: { x: number; y: number; roomName: string }
}
