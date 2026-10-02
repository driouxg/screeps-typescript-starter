import { containerBuilt, remoteOf, sendHome } from "remote/remoteCreeps"
import { findOffloadSpot } from "./common/creepBehavior"
import { smartMove } from "./common/movement"
import { park, unpark } from "./common/parking"
import ICreepHandler from "./ICreepHandler"

/** Energy within this range of the miner's spot is the source's: the container, and piles next to it. */
const PILE_RANGE = 1
/** While waiting at home with nothing wanting energy, only look for an offload target this often (it path-finds). */
const IDLE_RECHECK_TICKS = 5

/**
 * - collect: out to the remote source, taking from its container and the piles next to it.
 * - return: walking home with a load.
 * - deliver: at home, walking to the memorized offload target and offloading there.
 * - wait: at home with energy but nothing wanting it; parked, looking again every IDLE_RECHECK_TICKS.
 */
export type RemoteHaulerState = "collect" | "return" | "deliver" | "wait"

/**
 * Goal: Carry a remote source's energy home, on its own: nothing but CARRY and MOVE (2 CARRY per MOVE once the
 * highway is built), so all its parts are logistics.
 *
 * A state machine (see RemoteHaulerState). Only goes out while the container is built (waits at home otherwise). Takes
 * what's in it and in piles next to it, and drives home once full, or once there's nothing left to take and it carries
 * at least half a load. At home it picks an offload target once (like a home hauler: see findOffloadSpot), walks to
 * it and offloads, and only then picks the next one. Brings what it carries home while the room is paused.
 */
export default class RemoteHaulerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteHaulerMemory
    if (!memory.state) memory.state = 0 < creep.store.energy ? "return" : "collect"

    switch (memory.state) {
      case "collect":
        return this.collect(creep, memory)
      case "return":
        return this.return(creep, memory)
      case "deliver":
        return this.deliver(creep, memory)
      case "wait":
        return this.wait(creep, memory)
    }
  }

  private collect(creep: Creep, memory: RemoteHaulerMemory): void {
    if (creep.store.getFreeCapacity() <= 0) return this.goHome(creep, memory)

    // The source isn't mined (or its room is paused), or its container is gone (destroyed, or its room lost from view
    // along with the miner): bring home what we carry, or wait at home for it.
    const remote = remoteOf(creep)
    if (!remote || !containerBuilt(remote)) {
      if (0 < creep.store.energy) return this.goHome(creep, memory)
      return sendHome(creep)
    }

    const spot = new RoomPosition(remote.spot.x, remote.spot.y, remote.room)
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
      if (creep.store.getCapacity() / 2 <= creep.store.energy) this.goHome(creep, memory)
      return
    }
    const code = target instanceof Resource ? creep.pickup(target) : creep.withdraw(target, RESOURCE_ENERGY)
    if (code === ERR_NOT_IN_RANGE) smartMove(creep, target, 1)
  }

  private goHome(creep: Creep, memory: RemoteHaulerMemory): void {
    memory.state = "return"
    this.return(creep, memory)
  }

  private return(creep: Creep, memory: RemoteHaulerMemory): void {
    if (creep.room.name !== creep.memory.room) {
      smartMove(creep, new RoomPosition(25, 25, creep.memory.room), 20)
      return
    }
    delete memory.offload
    memory.state = "deliver"
    this.deliver(creep, memory)
  }

  /** Walk to the memorized offload target (picked once, on arrival or after the last offload) and offload there. */
  private deliver(creep: Creep, memory: RemoteHaulerMemory): void {
    if (creep.store.energy <= 0) return this.backToCollect(creep, memory)
    if (creep.room.name !== creep.memory.room) return this.goHome(creep, memory) // pushed out over the edge

    if (!memory.offload && !this.pickOffload(creep, memory)) {
      memory.state = "wait"
      memory.waitSince = Game.time
      park(creep)
      return
    }
    const offload = memory.offload!
    const pos = new RoomPosition(offload.x, offload.y, offload.roomName)

    if (!creep.pos.inRangeTo(pos, offload.range)) {
      if (smartMove(creep, pos, offload.range) === ERR_NO_PATH) delete memory.offload // stuck: pick another next tick
      return
    }

    // Arrived: offload, then pick the next target next tick (once the store has updated), if there's energy left.
    const structure = creep.room
      .lookForAt(LOOK_STRUCTURES, pos)
      .find(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)
    if (structure) creep.transfer(structure, RESOURCE_ENERGY)
    else creep.drop(RESOURCE_ENERGY)
    delete memory.offload
  }

  /** Parked at home with energy nobody wants: look for a target now and then. */
  private wait(creep: Creep, memory: RemoteHaulerMemory): void {
    if (creep.store.energy <= 0) return this.backToCollect(creep, memory)
    if ((Game.time - (memory.waitSince ?? 0)) % IDLE_RECHECK_TICKS === 0 && this.pickOffload(creep, memory)) {
      unpark(creep)
      memory.state = "deliver"
      return this.deliver(creep, memory)
    }
    park(creep)
  }

  private backToCollect(creep: Creep, memory: RemoteHaulerMemory): void {
    delete memory.offload
    delete memory.waitSince
    unpark(creep)
    memory.state = "collect"
    this.collect(creep, memory)
  }

  /** Pick and memorize where to offload; a structure is offloaded into from next to it, a drop spot from on it. */
  private pickOffload(creep: Creep, memory: RemoteHaulerMemory): boolean {
    const pos = findOffloadSpot(creep)
    if (!pos) return false
    const structure = creep.room
      .lookForAt(LOOK_STRUCTURES, pos)
      .some(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)
    memory.offload = { x: pos.x, y: pos.y, roomName: pos.roomName, range: structure ? 1 : 0 }
    return true
  }
}

export interface RemoteHaulerMemory extends CreepMemory {
  targetSourceId: string
  state?: RemoteHaulerState
  /** Where it's taking its load at home, and how close it must get to offload. */
  offload?: { x: number; y: number; roomName: string; range: number }
  /** Tick it started waiting at home, to space out its searches (see IDLE_RECHECK_TICKS). */
  waitSince?: number
}
