import { remoteOf, sendHome } from "remote/remoteCreeps"
import { myUsername } from "utils/username"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** Energy on the ground this close to the source is picked up for the container (see build)... */
const PILE_RANGE = 3
/** ...when there's more than this of it: not worth leaving the spot for less. */
const MIN_PILE = 20
/** While mining, the container's health is looked at this often (it loses 5000 hits every 100 ticks out here). */
const CHECK_TICKS = 25
/** The container is repaired (to full) once below this share of its hits. */
const REPAIR_BELOW = 0.9
/** Roads within this range of the spot are repaired while the source regenerates. */
const ROAD_RANGE = 3

/**
 * - travel:  walking to its spot (next to the source, where the planner put the container).
 * - build:   container not built yet: harvests, and builds it whenever the CARRY is full.
 * - pickup:  picking up energy lying near the source for the container (quicker than harvesting it).
 * - mine:    harvesting on top of the container (its CARRY fills first, then energy spills into the container).
 * - repair:  repairing the container (or a road nearby while the source regenerates) with energy from the container.
 */
export type RemoteMinerState = "travel" | "build" | "pickup" | "mine" | "repair"

/**
 * Goal: Mine a remote source (see RemotePlanner) from on top of its container, and keep that bit of infrastructure
 * up on the spot, so haulers stay pure haulers and the highway maintainer is rarely needed. Haulers only come once
 * the container is built (see containerBuilt).
 *
 * A state machine (see RemoteMinerState): each state does only its own job, and what it works on (container, pile,
 * repair target) is looked up once and remembered, so a miner that's just mining costs a harvest a tick. Searches
 * happen on state changes, or every CHECK_TICKS:
 *   - building: a pile within PILE_RANGE of the source is looked for each time the CARRY is empty; the container's
 *     site is placed if there's none. No building while another player has the room reserved (the container would be
 *     theirs to use; see remote/contest): just harvesting. Its reserver is sent first (see RemoteSpawnHandler), so the
 *     room is usually ours by then; not waiting for our own reservation, which lapses between reservers.
 *   - mining: every CHECK_TICKS the container's hits (repaired below REPAIR_BELOW); when the source runs dry, the
 *     roads within ROAD_RANGE (repaired until the source has regenerated).
 *
 * Its spare WORK part (see remoteBodies.minerBody) pays for the ticks spent repairing. Goes home while the room is
 * paused, or if the source is no longer mined.
 */
export default class RemoteMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as RemoteMinerMemory
    const remote = remoteOf(creep)
    if (!remote) {
      memory.state = "travel"
      return sendHome(creep)
    }
    // In a room another player owns, nothing can be harvested (the game returns ERR_NOT_OWNER): it was planned on
    // stale intel. Have the remotes re-planned (they drop the room) and go home meanwhile.
    const owner = creep.room.name === remote.room ? creep.room.controller?.owner?.username : undefined
    if (owner && owner !== myUsername()) {
      if (!Memory.remotesReplan) console.log(`Remote ${remote.room}: owned by ${owner}, can't be mined; re-planning`)
      Memory.remotesReplan = true
      memory.state = "travel"
      return sendHome(creep)
    }

    const spot = new RoomPosition(remote.spot.x, remote.spot.y, remote.room)
    const source = Game.getObjectById(remote.id as Id<Source>)

    // Pushed off the spot (or not there yet): back to it, whatever it was doing (picking up walks off on purpose).
    if (memory.state !== "pickup" && memory.state !== "travel" && !creep.pos.isEqualTo(spot)) memory.state = "travel"

    switch (memory.state ?? "travel") {
      case "travel":
        return this.travel(creep, memory, spot, source)
      case "build":
        return this.build(creep, memory, spot, source!)
      case "pickup":
        return this.pickup(creep, memory, spot)
      case "mine":
        return this.mine(creep, memory, spot, source!)
      case "repair":
        return this.repair(creep, memory, source!)
    }
  }

  private travel(creep: Creep, memory: RemoteMinerMemory, spot: RoomPosition, source: Source | null): void {
    if (!creep.pos.isEqualTo(spot)) {
      // Someone (an old miner) still on the spot: mine from next to the source meanwhile.
      if (source && creep.pos.isNearTo(source) && spot.lookFor(LOOK_CREEPS).length) creep.harvest(source)
      else smartMove(creep, spot, 0)
      return
    }
    if (!source) return
    const container = containerAt(spot)
    if (container) return this.toMine(creep, memory, container, source)
    memory.state = "build"
    this.build(creep, memory, spot, source)
  }

  private build(creep: Creep, memory: RemoteMinerMemory, spot: RoomPosition, source: Source): void {
    // Empty: energy already lying about is quicker than harvesting it.
    if (creep.store.energy <= 0) {
      const pile = creep.pos.findClosestByRange(
        source.pos.findInRange(FIND_DROPPED_RESOURCES, PILE_RANGE, {
          filter: r => r.resourceType === RESOURCE_ENERGY && MIN_PILE < r.amount
        })
      )
      if (pile && !creep.pos.isEqualTo(pile.pos)) {
        memory.state = "pickup"
        memory.pileId = pile.id
        return this.pickup(creep, memory, spot)
      }
      if (pile) creep.pickup(pile)
    }
    if (creep.store.getFreeCapacity() > 0) {
      creep.harvest(source)
      return
    }

    // Full: build, unless the room is someone else's.
    const holder = creep.room.controller?.reservation?.username
    if (holder && holder !== myUsername()) return void creep.harvest(source)
    const site = spot.lookFor(LOOK_CONSTRUCTION_SITES)[0]
    if (site) {
      creep.build(site)
      return
    }
    const container = containerAt(spot)
    if (container) return this.toMine(creep, memory, container, source)
    creep.room.createConstructionSite(spot, STRUCTURE_CONTAINER)
  }

  private pickup(creep: Creep, memory: RemoteMinerMemory, spot: RoomPosition): void {
    const pile = memory.pileId ? Game.getObjectById(memory.pileId) : null
    if (!pile || creep.store.getFreeCapacity() <= 0) {
      delete memory.pileId
      memory.state = "travel" // back to the spot to build
      return void smartMove(creep, spot, 0)
    }
    if (creep.pickup(pile) === ERR_NOT_IN_RANGE) smartMove(creep, pile, 1)
  }

  private toMine(creep: Creep, memory: RemoteMinerMemory, container: StructureContainer, source: Source): void {
    memory.state = "mine"
    memory.containerId = container.id
    delete memory.pileId
    this.mine(creep, memory, creep.pos, source)
  }

  private mine(creep: Creep, memory: RemoteMinerMemory, spot: RoomPosition, source: Source): void {
    if (Game.time % CHECK_TICKS === 0) {
      const container = memory.containerId ? Game.getObjectById(memory.containerId) : null
      if (!container) {
        delete memory.containerId
        memory.state = "build"
        return this.build(creep, memory, spot, source)
      }
      if (container.hits < container.hitsMax * REPAIR_BELOW) return this.toRepair(creep, memory, container, source)
    }
    if (creep.harvest(source) === ERR_NOT_ENOUGH_RESOURCES) {
      // Dry until it regenerates: time to see to the roads nearby.
      const road = creep.pos
        .findInRange(FIND_STRUCTURES, ROAD_RANGE, {
          filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax
        })
        .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0]
      if (road) this.toRepair(creep, memory, road, source)
    }
  }

  private toRepair(creep: Creep, memory: RemoteMinerMemory, target: Structure, source: Source): void {
    memory.state = "repair"
    memory.repairId = target.id
    this.repair(creep, memory, source)
  }

  /**
   * Repair the target to full with energy from the container: take some out when the CARRY is empty, mine if the
   * container's empty too. A road only while the source is dry.
   */
  private repair(creep: Creep, memory: RemoteMinerMemory, source: Source): void {
    const target = memory.repairId ? Game.getObjectById(memory.repairId) : null
    const road = target?.structureType === STRUCTURE_ROAD
    if (!target || target.hitsMax <= target.hits || (road && 0 < source.energy)) {
      delete memory.repairId
      memory.state = "mine"
      return void creep.harvest(source)
    }
    const container = memory.containerId ? Game.getObjectById(memory.containerId) : null
    if (0 < creep.store.energy) creep.repair(target)
    else if (container && 0 < container.store.energy) creep.withdraw(container, RESOURCE_ENERGY)
    else creep.harvest(source)
  }
}

function containerAt(spot: RoomPosition): StructureContainer | undefined {
  return spot.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as
    | StructureContainer
    | undefined
}

export interface RemoteMinerMemory extends CreepMemory {
  targetSourceId: string
  state?: RemoteMinerState
  containerId?: Id<StructureContainer>
  /** The pile it's picking up (pickup), and the structure it's repairing (repair). */
  pileId?: Id<Resource>
  repairId?: Id<Structure>
}
