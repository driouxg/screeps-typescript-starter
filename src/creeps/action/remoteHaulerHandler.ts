import { remoteOf, sendHome } from "remote/remoteCreeps"
import { smartMove } from "./common/movement"
import { offloadEnergy } from "./haulerHandler"
import ICreepHandler from "./ICreepHandler"

/** Energy within this range of the source counts as the miner's pile. */
const PILE_RANGE = 2

/**
 * Goal: Carry a remote source's energy home. Collect the miner's piles next to the source until full (or half full
 * once the piles run out), then deliver like a home hauler. Brings what it carries home while the room is paused.
 */
export default class RemoteHaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteHaulerMemory
    const remote = remoteOf(creep)

    if (memory.working && creep.store.energy <= 0) memory.working = false
    if (!memory.working && creep.store.getFreeCapacity() <= 0) memory.working = true

    if (!remote) {
      if (0 < creep.store.energy) memory.working = true
      else return sendHome(creep)
    }

    if (memory.working) {
      if (creep.room.name !== creep.memory.room) sendHome(creep)
      else offloadEnergy(creep)
      return
    }

    const sourcePos = new RoomPosition(remote!.x, remote!.y, remote!.room)
    if (creep.room.name !== remote!.room || !creep.pos.inRangeTo(sourcePos, PILE_RANGE + 1)) {
      smartMove(creep, sourcePos, PILE_RANGE)
      return
    }

    const pile = sourcePos
      .findInRange(FIND_DROPPED_RESOURCES, PILE_RANGE, { filter: r => r.resourceType === RESOURCE_ENERGY })
      .sort((a, b) => b.amount - a.amount)[0]
    if (pile) {
      if (creep.pickup(pile) === ERR_NOT_IN_RANGE) smartMove(creep, pile, 1)
    } else if (creep.store.getFreeCapacity() < creep.store.energy) memory.working = true
  }
}

export interface RemoteHaulerMemory extends CreepMemory {
  targetSourceId: string
}
