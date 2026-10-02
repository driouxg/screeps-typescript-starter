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

declare global {
  interface RoomMemory {
    /** The pioneers have upgraded the new room's controller enough to build its spawn (see ExpanderHandler). */
    pioneerUpgradeDone?: boolean
  }
}

/**
 * Goal: Pioneer for a newly claimed room. Walk there, harvest its sources (spread across them, picking up dropped
 * energy first), upgrade the controller to SAFE_MODE_LEVEL and top up its downgrade timer, then build the first spawn.
 * Once the spawn exists, stay on as one of the room's builders.
 */
export default class ExpanderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ExpanderMemory
    const target = memory.targetRoom
    if (!target) return

    if (creep.room.name !== target) {
      smartMove(creep, new RoomPosition(25, 25, target), 20)
      return
    }

    if (0 < creep.room.find(FIND_MY_SPAWNS).length) {
      // Job done: the new room's own spawn and economy take over; help it as a builder.
      creep.memory.role = creepRoles.BUILDER
      creep.memory.room = target
      return
    }

    if (memory.working && creep.store.energy <= 0) memory.working = false
    if (!memory.working && creep.store.getFreeCapacity() <= 0) memory.working = true

    if (memory.working) this.work(creep)
    else this.gather(creep)
  }

  private work(creep: Creep) {
    const controller = creep.room.controller
    const site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_SPAWN
    })
    const mustUpgrade = controller?.my === true && this.mustUpgrade(controller)

    if (site && !mustUpgrade) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) smartMove(creep, site, 3)
    } else if (controller?.my) {
      if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 3)
    }
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

  private gather(creep: Creep) {
    const pile = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && 50 <= r.amount
    })
    if (pile && creep.pos.getRangeTo(pile) <= 10) {
      if (creep.pickup(pile) === ERR_NOT_IN_RANGE) smartMove(creep, pile, 1)
      return
    }

    const memory = creep.memory as ExpanderMemory
    let source = memory.targetSourceId ? Game.getObjectById(memory.targetSourceId as Id<Source>) : null
    if (!source || source.energy <= 0) {
      source = this.leastBusySource(creep)
      memory.targetSourceId = source?.id
    }
    if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) smartMove(creep, source, 1)
  }

  /** The source with energy left that the fewest other pioneers are assigned to, closest first. */
  private leastBusySource(creep: Creep): Source | null {
    const others = creep.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role === creepRoles.EXPANDER && c.id !== creep.id
    })
    const load = (s: Source) => others.filter(c => (c.memory as ExpanderMemory).targetSourceId === s.id).length
    const sources = creep.room.find(FIND_SOURCES_ACTIVE)
    sources.sort((a, b) => load(a) - load(b) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b))
    return sources[0] ?? null
  }
}

export interface ExpanderMemory extends CreepMemory {
  targetRoom: string
  targetSourceId?: string
}
