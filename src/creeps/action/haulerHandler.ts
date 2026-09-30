import { isRoomPositionJson, jsonToRoomPosition } from "utils/jsonMapper"
import {
  findOffloadSpot,
  findPickupPosition,
  hasEnergy,
  hasMaxEnergy,
  moveToWithSinglePath
} from "./common/creepBehavior"
import { park, unpark } from "./common/parking"
import ICreepHandler from "./ICreepHandler"

/** While parked with nothing to do, only look for work this often; the searches path-find and cost CPU. */
const IDLE_RECHECK_TICKS = 5

export default class HaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as HaulerMemory

    if (memory.parkPos && Game.time % IDLE_RECHECK_TICKS !== 0) {
      park(creep)
      return
    }

    if (memory.working && !hasEnergy(creep)) memory.working = false
    if (!memory.working && hasMaxEnergy(creep)) memory.working = true

    if (memory.working) offloadEnergy(creep)
    else collectEnergy(creep)
  }
}

function collectEnergy(creep: Creep) {
  const memory = creep.memory as HaulerMemory
  let target = isRoomPositionJson(memory.pickupTargetPos) ? jsonToRoomPosition(memory.pickupTargetPos) : null
  if (!target) {
    target = findPickupPosition(creep)
    memory.pickupTargetPos = target ?? undefined
  }

  if (!target) {
    // Nothing to collect: deliver what we're carrying if anything wants it, otherwise wait out of the way.
    if (hasEnergy(creep) && findOffloadSpot(creep)) memory.working = true
    else park(creep)
    return
  }
  unpark(creep)

  const store = creep.room
    .lookForAt(LOOK_STRUCTURES, target)
    .find(s => s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE)
  const code = store
    ? creep.withdraw(store, RESOURCE_ENERGY)
    : creep.pickup(creep.room.lookForAt(LOOK_ENERGY, target)[0])

  if (code === ERR_NOT_IN_RANGE) {
    if (moveToWithSinglePath(creep, target) === ERR_NO_PATH)
      memory.pickupTargetPos = findPickupPosition(creep) ?? undefined
  } else memory.pickupTargetPos = findPickupPosition(creep) ?? undefined
}

export interface HaulerMemory extends CreepMemory {
  offloadTargetPos?: { x: number; y: number; roomName: string }
  pickupTargetPos?: { x: number; y: number; roomName: string }
}

export function offloadEnergy(creep: Creep) {
  const memory = creep.memory as HaulerMemory
  let offloadSpot = isRoomPositionJson(memory.offloadTargetPos) ? jsonToRoomPosition(memory.offloadTargetPos) : null
  if (!offloadSpot) {
    offloadSpot = findOffloadSpot(creep)
    memory.offloadTargetPos = offloadSpot ?? undefined
  }

  if (!offloadSpot) {
    // Nothing needs energy: top up if there's more to collect, otherwise hold it and wait out of the way rather
    // than dropping it where we stand (often next to the spawn, where it decays and gets in the way).
    if (0 < creep.store.getFreeCapacity() && findPickupPosition(creep)) memory.working = false
    else park(creep)
    return
  }
  unpark(creep)

  const offloadStructure = creep.room
    .lookForAt(LOOK_STRUCTURES, offloadSpot)
    .filter(c => c.structureType !== STRUCTURE_ROAD && c.structureType !== STRUCTURE_RAMPART)

  // Drop resources at position
  if (offloadStructure.length <= 0) {
    if (creep.pos.isEqualTo(offloadSpot.x, offloadSpot.y)) {
      creep.drop(RESOURCE_ENERGY)
      memory.offloadTargetPos = findOffloadSpot(creep) ?? undefined
    } else if (moveToWithSinglePath(creep, offloadSpot, 0) === ERR_NO_PATH)
      memory.offloadTargetPos = findOffloadSpot(creep) ?? undefined
  } else {
    // Transfer resources to structure
    if (creep.transfer(offloadStructure[0], RESOURCE_ENERGY) !== ERR_NOT_IN_RANGE)
      memory.offloadTargetPos = findOffloadSpot(creep) ?? undefined
    else if (moveToWithSinglePath(creep, offloadSpot) === ERR_NO_PATH)
      memory.offloadTargetPos = findOffloadSpot(creep) ?? undefined
  }
}
