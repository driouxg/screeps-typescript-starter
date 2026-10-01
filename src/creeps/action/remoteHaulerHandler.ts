import { remoteOf, sendHome } from "remote/remoteCreeps"
import { smartMove } from "./common/movement"
import { offloadEnergy } from "./haulerHandler"
import ICreepHandler from "./ICreepHandler"

/** Energy within this range of the miner's spot is the source's (the container, and piles before it's built). */
const PILE_RANGE = 1

/**
 * Goal: Carry a remote source's energy home, on its own: nothing but CARRY and MOVE (2 CARRY per MOVE once the
 * highway is built), so all its parts are logistics.
 *
 * Walks to the source's container, takes what's in it (and in piles next to it, before the container is built), and
 * drives home once full, or once there's nothing left to take and it carries at least half a load. At home it
 * delivers like a home hauler (see deliver). Brings what it carries home while the room is paused.
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

    if (memory.working) return this.deliver(creep)

    const spot = new RoomPosition(remote!.spot.x, remote!.spot.y, remote!.room)
    if (creep.room.name !== spot.roomName || !creep.pos.inRangeTo(spot, PILE_RANGE + 1)) {
      smartMove(creep, spot, 1)
      return
    }

    const container = spot.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as
      | StructureContainer
      | undefined
    const pile = spot
      .findInRange(FIND_DROPPED_RESOURCES, PILE_RANGE, { filter: r => r.resourceType === RESOURCE_ENERGY })
      .sort((a, b) => b.amount - a.amount)[0]
    const target = pile ?? (container && 0 < container.store.energy ? container : undefined)
    if (!target) {
      // Nothing to take: go with half a load or more, otherwise wait next to the container (not on it: the miner is).
      if (creep.store.getCapacity() / 2 <= creep.store.energy) memory.working = true
      return
    }
    const code = target instanceof Resource ? creep.pickup(target) : creep.withdraw(target, RESOURCE_ENERGY)
    if (code === ERR_NOT_IN_RANGE) smartMove(creep, target, 1)
  }

  /**
   * Home, then deliver like a home hauler: spawns and extensions, towers, the controller container, builders, and the
   * storage last. Straight into the storage instead left upgraders starving next to a storage filling up.
   */
  private deliver(creep: Creep): void {
    if (creep.room.name !== creep.memory.room) return sendHome(creep)
    offloadEnergy(creep)
  }
}

export interface RemoteHaulerMemory extends CreepMemory {
  targetSourceId: string
}
