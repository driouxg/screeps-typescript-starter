import * as creepRoles from "../roles"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** Upgrade instead of building if the new controller gets this close to downgrading: an emergency only. */
const DOWNGRADE_SAFETY = 2000
/**
 * Upgrade to this level before building: a newly claimed controller has no safe mode, and each level reached adds one
 * (see SafeModeHandler), so a raid on the pioneers can be stopped. Level 2 is only 200 energy of upgrading.
 */
const SAFE_MODE_LEVEL = 2
/**
 * Having reached SAFE_MODE_LEVEL, keep upgrading until the downgrade timer is this share of its maximum for the level
 * (each upgrade adds CONTROLLER_DOWNGRADE_RESTORE ticks). It's low right after a level-up, and topped up once it
 * lasts the whole spawn build (9000 ticks at RCL 2), instead of the pioneers coming back to it again and again.
 * Progress towards the next level doesn't help: only the timer decides when a controller downgrades.
 */
const TOP_UP_SHARE = 0.9
/** Dropped energy at least this big and this close is picked up before harvesting. */
const PILE_MIN = 50
const PILE_RANGE = 10
/** Within this range of a source with every tile next to it taken, a pioneer waits instead of pushing in. */
const WAIT_RANGE = 3

declare global {
  interface RoomMemory {
    /** The pioneers have upgraded the new room's controller enough to build its spawn (see ExpanderHandler). */
    pioneerUpgradeDone?: boolean
  }
}

/**
 * - travel:  walking to the new room.
 * - harvest: filling up from the memorized pile or source.
 * - fill:    taking energy to the memorized spawn or extension.
 * - build:   building the memorized construction site.
 * - upgrade: upgrading the controller.
 */
export type ExpanderState = "travel" | "harvest" | "fill" | "build" | "upgrade"

/**
 * Goal: Pioneer for a newly claimed room. Walk there, harvest its sources (spread across them, picking up dropped
 * energy first), upgrade the controller to SAFE_MODE_LEVEL and top up its downgrade timer, then build the first spawn.
 * Once the spawn exists, keep harvesting: fill the spawn and extensions first, and build the room's construction sites
 * with the surplus (upgrading when there's nothing to build).
 *
 * A state machine (see ExpanderState): each state works on a target picked once, on entering it, and kept until it's
 * done, so targets aren't searched for every tick and the path to them (which moveTo caches per target) is reused.
 */
export default class ExpanderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ExpanderMemory
    if (!memory.targetRoom) return
    if (creep.room.name !== memory.targetRoom) memory.state = "travel"
    else if (!memory.state || memory.state === "travel") this.toHarvest(memory)

    switch (memory.state) {
      case "travel":
        smartMove(creep, new RoomPosition(25, 25, memory.targetRoom), 20)
        return
      case "harvest":
        return this.harvest(creep, memory)
      case "fill":
        return this.fill(creep, memory)
      case "build":
        return this.build(creep, memory)
      case "upgrade":
        return this.upgrade(creep, memory)
    }
  }

  private harvest(creep: Creep, memory: ExpanderMemory): void {
    if (creep.store.getFreeCapacity() <= 0) return this.chooseWork(creep, memory)

    if (memory.pickupId) {
      const pile = Game.getObjectById(memory.pickupId)
      if (pile) {
        if (creep.pickup(pile) === ERR_NOT_IN_RANGE) smartMove(creep, pile, 1)
        return
      }
      delete memory.pickupId
    }

    let source = memory.targetSourceId ? Game.getObjectById(memory.targetSourceId as Id<Source>) : null
    if (!source || source.energy <= 0) {
      // Out of energy until it regenerates: get on with what we carry, or move to another source.
      if (source && 0 < creep.store.energy) return this.chooseWork(creep, memory)
      source = this.leastBusySource(creep)
      memory.targetSourceId = source?.id
    }
    if (!source) return
    if (creep.pos.isNearTo(source)) {
      creep.harvest(source)
      return
    }
    // Every tile next to the source is taken: pushing in would repath and shove every tick, for nothing. Get on with
    // what we carry, or wait nearby for a tile to free up.
    if (creep.pos.inRangeTo(source, WAIT_RANGE) && freeSlots(source) <= 0) {
      if (0 < creep.store.energy) this.chooseWork(creep, memory)
      return
    }
    smartMove(creep, source, 1)
  }

  private fill(creep: Creep, memory: ExpanderMemory): void {
    if (creep.store.energy <= 0) return this.startHarvest(creep, memory)
    const sink = memory.workId ? Game.getObjectById(memory.workId as Id<StructureSpawn | StructureExtension>) : null
    if (!sink || sink.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) return this.chooseWork(creep, memory)

    const code = creep.transfer(sink, RESOURCE_ENERGY)
    if (code === ERR_NOT_IN_RANGE) smartMove(creep, sink, 1)
    // Delivered: anything left over goes to the next job, picked next tick once the stores have updated.
    else delete memory.workId
  }

  private build(creep: Creep, memory: ExpanderMemory): void {
    if (creep.store.energy <= 0) return this.startHarvest(creep, memory)
    const site = memory.workId ? Game.getObjectById(memory.workId as Id<ConstructionSite>) : null
    if (!site) return this.chooseWork(creep, memory) // finished (or removed)
    if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, 3)
  }

  private upgrade(creep: Creep, memory: ExpanderMemory): void {
    if (creep.store.energy <= 0) return this.startHarvest(creep, memory)
    const controller = creep.room.controller
    if (!controller?.my) return
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 3)
  }

  /**
   * Pick the next job for a load of energy, once: the controller if it must be upgraded (see mustUpgrade); once the
   * spawn exists, the nearest spawn or extension that needs energy, then the nearest construction site; before it
   * exists, the spawn's site. Otherwise upgrade.
   */
  private chooseWork(creep: Creep, memory: ExpanderMemory): void {
    delete memory.workId
    const controller = creep.room.controller
    const spawnBuilt = 0 < creep.room.find(FIND_MY_SPAWNS).length
    // Once the spawn is up the pioneers belong to the new room.
    if (spawnBuilt) creep.memory.room = memory.targetRoom

    let target: { id: string } | null = null
    let state: ExpanderState = "upgrade"
    if (!(controller?.my && this.mustUpgrade(controller))) {
      const sink = spawnBuilt
        ? creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: s =>
              (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
              0 < s.store.getFreeCapacity(RESOURCE_ENERGY)
          })
        : null
      const site = sink
        ? null
        : creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => spawnBuilt || s.structureType === STRUCTURE_SPAWN
          })
      if (sink) [target, state] = [sink, "fill"]
      else if (site) [target, state] = [site, "build"]
    }
    memory.state = state
    if (target) memory.workId = target.id

    // Act on it this tick too.
    if (state === "fill") this.fill(creep, memory)
    else if (state === "build") this.build(creep, memory)
    else this.upgrade(creep, memory)
  }

  private startHarvest(creep: Creep, memory: ExpanderMemory): void {
    this.toHarvest(memory)
    // A big enough pile close by is quicker than harvesting: looked for once per trip.
    const pile = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && PILE_MIN <= r.amount
    })
    if (pile && creep.pos.getRangeTo(pile) <= PILE_RANGE) memory.pickupId = pile.id
    this.harvest(creep, memory)
  }

  private toHarvest(memory: ExpanderMemory): void {
    memory.state = "harvest"
    delete memory.workId
    delete memory.pickupId
  }

  /** Up to SAFE_MODE_LEVEL and a topped-up timer once (see TOP_UP_SHARE), then only if it's about to downgrade. */
  private mustUpgrade(controller: StructureController): boolean {
    const ticksToDowngrade = controller.ticksToDowngrade ?? Infinity
    if (ticksToDowngrade < DOWNGRADE_SAFETY) return true
    const memory = controller.room.memory
    if (memory.pioneerUpgradeDone) return false
    if (controller.level < SAFE_MODE_LEVEL) return true
    if (ticksToDowngrade < CONTROLLER_DOWNGRADE[controller.level] * TOP_UP_SHARE) return true
    memory.pioneerUpgradeDone = true
    return false
  }

  /** The source with energy left that the fewest other pioneers are assigned to, closest first. */
  private leastBusySource(creep: Creep): Source | null {
    const others = creep.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role === creepRoles.EXPANDER && c.id !== creep.id
    })
    // Pioneers per tile next to the source: a source with one open tile is full with one pioneer.
    const load = (s: Source) =>
      others.filter(c => (c.memory as ExpanderMemory).targetSourceId === s.id).length / slots(s)
    const sources = creep.room.find(FIND_SOURCES_ACTIVE)
    sources.sort((a, b) => load(a) - load(b) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))
    return sources[0] ?? null
  }
}

/** Walkable tiles next to a source, cached (terrain doesn't change). */
const slotCache = new Map<string, number>()
function slots(source: Source): number {
  let n = slotCache.get(source.id)
  if (n === undefined) {
    const terrain = source.room.getTerrain()
    n = 0
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if ((dx || dy) && terrain.get(source.pos.x + dx, source.pos.y + dy) !== TERRAIN_MASK_WALL) n++
    slotCache.set(source.id, Math.max(1, n))
  }
  return n || 1
}

/** Walkable tiles next to a source with no creep on them. */
function freeSlots(source: Source): number {
  const { x, y } = source.pos
  const taken = source.room.lookForAtArea(LOOK_CREEPS, y - 1, x - 1, y + 1, x + 1, true).length
  return slots(source) - taken
}

export interface ExpanderMemory extends CreepMemory {
  targetRoom: string
  targetSourceId?: string
  state?: ExpanderState
  /** The spawn/extension (fill) or construction site (build) it's working on. */
  workId?: string
  /** Dropped energy it's picking up before harvesting. */
  pickupId?: Id<Resource>
}
