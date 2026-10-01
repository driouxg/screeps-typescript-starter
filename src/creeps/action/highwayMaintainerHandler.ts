import * as creepRoles from "../roles"
import { roomsNeedingWork, survey, VISIT_BELOW } from "remote/highway"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** Don't go out of the way for less energy than this. */
const MIN_PICKUP = 50

/**
 * Goal: Build and repair the highway (see remote/highway) between home and its remote sources, then go back to work
 * at home. Spawned only when the highway needs it (a road below MAINTAIN_BELOW, or road sites to build), so remote
 * haulers can stay pure haulers.
 *
 * - Works through the highway rooms outside home that need it, nearest to home first: in each, builds its road sites,
 *   then repairs its worn highway roads (below VISIT_BELOW) to full hits, then re-surveys the room so it's off the list.
 * - Refuels from whatever is nearest: a container (remote ones hold the miners' energy) or pile, the home storage,
 *   or by harvesting a source itself.
 * - With nothing left to do, goes home and becomes a builder there (builders upgrade when there's nothing to build).
 */
export default class HighwayMaintainerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as MaintainerMemory
    if (memory.working && creep.store.energy <= 0) {
      memory.working = false
      delete memory.targetId
    }
    if (!memory.working && creep.store.getFreeCapacity() <= 0) memory.working = true

    if (!memory.working) return this.refuel(creep)

    const target = this.target(creep)
    if (target) {
      const code = target instanceof ConstructionSite ? creep.build(target) : creep.repair(target)
      if (code === ERR_NOT_IN_RANGE) smartMove(creep, target, 3)
      return
    }

    const next = roomsNeedingWork(creep.memory.room).find(name => name !== creep.room.name)
    if (next) {
      smartMove(creep, new RoomPosition(25, 25, next), 20)
      return
    }
    this.retire(creep)
  }

  /**
   * The site or road being worked on (a road is repaired to full hits), or the next one in this room: road sites on
   * the highway first, then highway roads below VISIT_BELOW, nearest first. Re-surveys the room once there's none left.
   * Nothing in the home room: home builders and towers look after it, and roads there always have a little decay to
   * top up, which kept the maintainer walking around home all its life.
   */
  private target(creep: Creep): ConstructionSite | StructureRoad | null {
    const memory = creep.memory as MaintainerMemory
    const current = memory.targetId ? Game.getObjectById(memory.targetId) : null
    if (current && (current instanceof ConstructionSite || current.hits < current.hitsMax)) return current

    const entry = Memory.highways?.[creep.memory.room]?.rooms[creep.room.name]
    if (!entry || creep.room.name === creep.memory.room) return null
    const onHighway = new Set(entry.tiles)
    const here = (o: RoomObject) => onHighway.has(o.pos.x * 50 + o.pos.y)

    const sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_ROAD && here(s)
    })
    const roads = creep.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * VISIT_BELOW && here(s)
    }) as StructureRoad[]
    const next = creep.pos.findClosestByRange(sites) ?? creep.pos.findClosestByRange(roads)
    memory.targetId = next?.id
    if (!next) survey(creep.room, entry)
    return next
  }

  private refuel(creep: Creep): void {
    const room = creep.room
    const containers = room.find(FIND_STRUCTURES, {
      filter: s =>
        (s.structureType === STRUCTURE_CONTAINER || (s.structureType === STRUCTURE_STORAGE && s.my)) &&
        MIN_PICKUP <= (s as StructureContainer | StructureStorage).store.energy
    }) as (StructureContainer | StructureStorage)[]
    const piles = room.find(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && MIN_PICKUP <= r.amount
    })
    const stock = creep.pos.findClosestByRange([...containers, ...piles])
    if (stock) {
      const code = stock instanceof Resource ? creep.pickup(stock) : creep.withdraw(stock, RESOURCE_ENERGY)
      if (code === ERR_NOT_IN_RANGE) smartMove(creep, stock, 1)
      return
    }

    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE)
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, 1)
      return
    }
    // Nothing here at all: what we carry is better than nothing.
    if (0 < creep.store.energy) (creep.memory as MaintainerMemory).working = true
  }

  /** Done: home, and work there as a builder for the rest of its life. */
  private retire(creep: Creep): void {
    const home = creep.memory.room
    if (creep.room.name !== home) {
      smartMove(creep, new RoomPosition(25, 25, home), 20)
      return
    }
    const memory = creep.memory as MaintainerMemory
    delete memory.targetId
    memory.role = creepRoles.BUILDER
    memory.working = false
  }
}

export interface MaintainerMemory extends CreepMemory {
  targetId?: Id<ConstructionSite | StructureRoad>
}
