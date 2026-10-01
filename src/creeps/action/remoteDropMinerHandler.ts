import { remoteOf, sendHome } from "remote/remoteCreeps"
import { CONTAINER_MIN_RCL } from "remote/remotePlanner"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Mine a remote source (see RemotePlanner) from on top of its container, and keep that bit of infrastructure
 * up on the spot, so haulers stay pure haulers and the highway maintainer is rarely needed.
 *
 * - Walks to its spot (next to the source, where the planner put the container). Before CONTAINER_MIN_RCL it just
 *   drop-mines there; from it, it places the container's construction site if there's none.
 * - Container not built yet: harvests, and builds it whenever its CARRY is full.
 * - Then harvests: its CARRY fills first, after that energy spills into the container under it.
 * - Container below full hits: repairs it, taking energy out of the container to do so.
 * - Source depleted (waiting to regenerate) and a road within reach below full hits: repairs it the same way.
 *
 * Its spare WORK part (see remoteBodies.minerBody) pays for the ticks spent repairing. Goes home while the room is
 * paused, or if the source is no longer mined.
 */
export default class RemoteMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const remote = remoteOf(creep)
    if (!remote) return sendHome(creep)

    const spot = new RoomPosition(remote.spot.x, remote.spot.y, remote.room)
    const source = Game.getObjectById(remote.id as Id<Source>)
    if (!creep.pos.isEqualTo(spot)) {
      // Someone (an old miner) still on the spot: mine from next to the source meanwhile.
      if (source && creep.pos.isNearTo(source) && spot.lookFor(LOOK_CREEPS).length) creep.harvest(source)
      else smartMove(creep, spot, 0)
      return
    }
    if (!source) return

    const container = spot.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as
      | StructureContainer
      | undefined
    if (!container) {
      // Drop-mine until the home room is far enough along for a container to pay off (see CONTAINER_MIN_RCL).
      const level = Game.rooms[creep.memory.room]?.controller?.level ?? 0
      if (level < CONTAINER_MIN_RCL) creep.harvest(source)
      else this.buildContainer(creep, spot, source)
      return
    }

    if (container.hits < container.hitsMax) return this.repair(creep, container, container)
    if (source.energy <= 0) {
      const road = creep.pos
        .findInRange(FIND_STRUCTURES, 3, { filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax })
        .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0]
      if (road) return this.repair(creep, road, container)
    }
    creep.harvest(source)
  }

  /** Harvest until the CARRY is full, then spend it on the container's site (placing the site first if needed). */
  private buildContainer(creep: Creep, spot: RoomPosition, source: Source): void {
    const site = spot.lookFor(LOOK_CONSTRUCTION_SITES)[0]
    if (!site) {
      creep.room.createConstructionSite(spot, STRUCTURE_CONTAINER)
      creep.harvest(source)
      return
    }
    if (creep.store.getFreeCapacity() <= 0) creep.build(site)
    else creep.harvest(source)
  }

  /** Repair `target` with energy from the container: take some out when the CARRY is empty, repair otherwise. */
  private repair(creep: Creep, target: Structure, container: StructureContainer): void {
    if (0 < creep.store.energy) creep.repair(target)
    else if (0 < container.store.energy) creep.withdraw(container, RESOURCE_ENERGY)
    else {
      // Nothing to repair with: mine, which fills the CARRY first.
      const source = Game.getObjectById(remoteOf(creep)!.id as Id<Source>)
      if (source) creep.harvest(source)
    }
  }
}

export interface RemoteMinerMemory extends CreepMemory {
  targetSourceId: string
}
