import { remoteOf, sendHome } from "remote/remoteCreeps"
import { myUsername } from "utils/username"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Mine a remote source (see RemotePlanner) from on top of its container, and keep that bit of infrastructure
 * up on the spot, so haulers stay pure haulers and the highway maintainer is rarely needed.
 *
 * - Walks to its spot (next to the source, where the planner put the container) and places the container's
 *   construction site if there's none. Haulers only come once the container is built (see containerBuilt).
 * - Container not built yet: picks up energy lying within PILE_RANGE of the source first (quicker than harvesting it),
 *   otherwise harvests, and builds it whenever its CARRY is full, except while another player has the
 *   room reserved (the container would be theirs to use; see remote/contest for taking it back). Its reserver is sent
 *   first (see RemoteSpawnHandler), so the room is usually ours by then. Not waiting for our own reservation: it lapses
 *   between reservers, and waiting kept the container, and so the haulers, from coming for thousands of ticks.
 * - Then harvests: its CARRY fills first, after that energy spills into the container under it.
 * - Container below full hits: repairs it, taking energy out of the container to do so.
 * - Source depleted (waiting to regenerate) and a road within reach below full hits: repairs it the same way.
 *
 * Its spare WORK part (see remoteBodies.minerBody) pays for the ticks spent repairing. Goes home while the room is
 * paused, or if the source is no longer mined.
 */
/** Energy on the ground this close to the source is picked up for the container (see pickUpForContainer)... */
const PILE_RANGE = 3
/** ...when there's more than this of it: not worth leaving the spot for less. */
const MIN_PILE = 20

export default class RemoteMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const remote = remoteOf(creep)
    if (!remote) return sendHome(creep)

    const spot = new RoomPosition(remote.spot.x, remote.spot.y, remote.room)
    const source = Game.getObjectById(remote.id as Id<Source>)
    // Before the spot: picking up a pile means stepping off it.
    if (source && this.pickUpForContainer(creep, spot, source)) return
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
    if (!container) return this.buildContainer(creep, spot, source)

    if (container.hits < container.hitsMax) return this.repair(creep, container, container)
    if (source.energy <= 0) {
      const road = creep.pos
        .findInRange(FIND_STRUCTURES, 3, { filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax })
        .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0]
      if (road) return this.repair(creep, road, container)
    }
    creep.harvest(source)
  }

  /**
   * Harvest until the CARRY is full, then spend it on the container's site (placing the site first if needed). While
   * another player has the room reserved, just harvest.
   */
  private buildContainer(creep: Creep, spot: RoomPosition, source: Source): void {
    const holder = creep.room.controller?.reservation?.username
    if (holder && holder !== myUsername()) {
      creep.harvest(source)
      return
    }
    const site = spot.lookFor(LOOK_CONSTRUCTION_SITES)[0]
    if (!site) {
      creep.room.createConstructionSite(spot, STRUCTURE_CONTAINER)
      creep.harvest(source)
      return
    }
    if (creep.store.getFreeCapacity() <= 0) creep.build(site)
    else creep.harvest(source)
  }

  /**
   * While the container isn't built and there's room in the CARRY: energy already lying within PILE_RANGE of the
   * source (dropped by an earlier miner, or a dead creep's) is quicker than harvesting it, so go and pick it up; then
   * back to the spot to build (see buildContainer). Returns whether it's doing that.
   */
  private pickUpForContainer(creep: Creep, spot: RoomPosition, source: Source): boolean {
    if (creep.room.name !== spot.roomName || creep.store.getFreeCapacity() <= 0) return false
    const built = spot.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_CONTAINER)
    if (built) return false
    const pile = creep.pos.findClosestByRange(
      source.pos.findInRange(FIND_DROPPED_RESOURCES, PILE_RANGE, {
        filter: r => r.resourceType === RESOURCE_ENERGY && MIN_PILE < r.amount
      })
    )
    if (!pile) return false
    if (creep.pickup(pile) === ERR_NOT_IN_RANGE) smartMove(creep, pile, 1)
    return true
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
