import { isTunnel, priorityOf, tunnelsAllowed } from "structures/construction/buildOrderConstructor"
import { defencesBelow, isDefence, RAMPART_MIN_HITS, rampartTarget } from "structures/rampartPolicy"
import { findPickupPosition } from "./common/creepBehavior"
import { clearTile, moveOffTile, smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** Don't walk to a pile or container for less than this share of our free capacity. */
const MIN_PICKUP_SHARE = 0.5
/** Leave energy near the controller for upgraders. */
const CONTROLLER_RESERVE_RANGE = 3
/**
 * Fallback tasks (upgrading with nothing to build, harvesting with nothing to collect) are reconsidered this often, so
 * a builder takes up new construction sites or a fresh pile within a few ticks instead of at the end of its trip.
 */
const FALLBACK_RECHECK_TICKS = 20
const FALLBACK_TASKS: BuilderTask["type"][] = ["upgrade", "harvest"]

type EnergyTarget = Resource<RESOURCE_ENERGY> | StructureContainer | StructureStorage | Tombstone | Ruin

/**
 * Outcome of carrying out a task this tick: still going; done after acting this tick (pick the next one next tick, as
 * a second action of the same kind would override this one); or not possible (pick another one now).
 */
type Outcome = "ongoing" | "done" | "failed"

/**
 * What the builder is doing, picked once and kept until it's done (see BuilderHandler):
 * - repair: `id` up to `goal` hits (its hitsMax if not given)
 * - build: construction site `id`
 * - upgrade: the room's controller
 * - collect: energy from `id` (pile, container, storage, tombstone or ruin)
 * - harvest: source `id`, when there's no energy to collect
 */
export interface BuilderTask {
  type: "repair" | "build" | "upgrade" | "collect" | "harvest"
  id?: string
  goal?: number
  /** Tick the task was chosen. */
  since: number
}

/**
 * Goal: Keep ramparts alive and structures repaired, build construction sites (highest priority, then most progressed,
 * first), and with nothing to build reinforce ramparts or upgrade the controller.
 *
 * A state machine, so the searches run once per objective instead of every tick:
 * - memory.working: spending energy (true) or collecting it (false). It flips when the store is empty or full.
 * - memory.task: the current objective (see BuilderTask). It's chosen when the state flips or the previous task is
 *   done (target finished, gone, or unreachable), and until then only carried out.
 *
 * So a builder re-weighs repairs against construction once per trip; sites placed meanwhile wait for its next trip.
 */
export default class BuilderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as BuilderMemory

    if (memory.working && creep.store.energy <= 0) this.switchTo(memory, false)
    else if (!memory.working && creep.store.getFreeCapacity() <= 0) this.switchTo(memory, true)

    // A task that couldn't be carried out gets one replacement straight away, so no tick is wasted.
    const task = memory.task
    if (task && FALLBACK_TASKS.includes(task.type) && FALLBACK_RECHECK_TICKS <= Game.time - task.since)
      memory.task = undefined

    for (let attempt = 0; attempt < 2; attempt++) {
      if (!memory.task) memory.task = memory.working ? this.chooseWork(creep) : this.chooseCollect(creep)
      if (!memory.task) return
      const outcome = this.perform(creep, memory.task)
      if (outcome === "ongoing") return
      memory.task = undefined
      if (outcome === "done") return
    }
  }

  private switchTo(memory: BuilderMemory, working: boolean): void {
    memory.working = working
    memory.task = undefined
  }

  /** Carry out the task for this tick. */
  private perform(creep: Creep, task: BuilderTask): Outcome {
    switch (task.type) {
      case "repair":
        return this.repair(creep, task)
      case "build":
        return this.build(creep, task)
      case "upgrade":
        return this.upgrade(creep)
      case "collect":
        return this.collect(creep, task)
      case "harvest":
        return this.harvest(creep, task)
    }
  }

  // --- Choosing (runs once per objective) ---

  /**
   * In order: ramparts/walls about to decay away, other damaged structures, construction, reinforcing ramparts/walls
   * towards the RCL's target (see rampartPolicy), and upgrading.
   */
  private chooseWork(creep: Creep): BuilderTask | undefined {
    const room = creep.room
    const closest = (structures: Structure[]) => creep.pos.findClosestByRange(structures)

    const decaying = closest(defencesBelow(room, RAMPART_MIN_HITS))
    if (decaying) return { type: "repair", id: decaying.id, goal: RAMPART_MIN_HITS, since: Game.time }

    const damaged = closest(room.find(FIND_STRUCTURES, { filter: s => !isDefence(s) && s.hits < s.hitsMax * 0.8 }))
    if (damaged) return { type: "repair", id: damaged.id, since: Game.time }

    const site = this.findConstructionSite(creep)
    if (site) return { type: "build", id: site.id, since: Game.time }

    const target = rampartTarget(room)
    const weak = closest(defencesBelow(room, target))
    if (weak) return { type: "repair", id: weak.id, goal: target, since: Game.time }

    if (room.controller?.my) return { type: "upgrade", since: Game.time }
    return undefined
  }

  private chooseCollect(creep: Creep): BuilderTask | undefined {
    const target = this.findEnergy(creep)
    if (target) return { type: "collect", id: target.id, since: Game.time }

    // Nothing to collect: use what we have, or harvest it ourselves.
    if (0 < creep.store.energy) {
      this.switchTo(creep.memory as BuilderMemory, true)
      return this.chooseWork(creep)
    }
    if (creep.getActiveBodyparts(WORK) <= 0) return undefined
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE, { ignoreCreeps: true })
    return source ? { type: "harvest", id: source.id, since: Game.time } : undefined
  }

  /**
   * Highest build priority first (same order the build order places them), then finish what's started, then closest.
   * Tunnels (roads on walls) are skipped before TUNNEL_MIN_RCL.
   */
  private findConstructionSite(creep: Creep): ConstructionSite | null {
    const room = creep.room
    const noTunnels = !tunnelsAllowed(room)
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => !(noTunnels && isTunnel(room, s.pos, s.structureType))
    })
    if (sites.length <= 0) return null

    const priority = (s: ConstructionSite) => priorityOf(room, s.pos, s.structureType)
    const progress = (s: ConstructionSite) => s.progress / s.progressTotal
    sites.sort(
      (a, b) =>
        priority(a) - priority(b) || progress(b) - progress(a) || creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b)
    )
    return sites[0]
  }

  private findEnergy(creep: Creep): EnergyTarget | null {
    const minAmount = Math.max(1, creep.store.getFreeCapacity() * MIN_PICKUP_SHARE)
    const controller = creep.room.controller
    const nearController = (pos: RoomPosition) =>
      controller !== undefined && pos.inRangeTo(controller.pos, CONTROLLER_RESERVE_RANGE)

    const piles = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY && minAmount <= r.amount && !nearController(r.pos)
    }) as Resource<RESOURCE_ENERGY>[]
    const stores = creep.room.find(FIND_STRUCTURES, {
      filter: s =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        minAmount <= s.store.energy &&
        !nearController(s.pos)
    }) as (StructureContainer | StructureStorage)[]
    const tombstones = creep.room.find(FIND_TOMBSTONES, { filter: t => minAmount <= t.store.energy })
    const ruins = creep.room.find(FIND_RUINS, { filter: r => minAmount <= r.store.energy })

    const candidates: EnergyTarget[] = [...piles, ...stores, ...tombstones, ...ruins]
    const closest = creep.pos.findClosestByPath(candidates, { ignoreCreeps: true })
    if (closest) return closest

    // Fall back to the source-side piles haulers use, even if they're small.
    const pickupPos = findPickupPosition(creep)
    if (!pickupPos) return null
    const pile = pickupPos.lookFor(LOOK_ENERGY)[0]
    return pile ?? null
  }

  // --- Performing (runs every tick, cheap) ---

  /** Move towards a target; a target we can't reach is given up so another gets picked. */
  private approach(creep: Creep, target: RoomObject, range: number): Outcome {
    return smartMove(creep, target, range) === ERR_NO_PATH ? "failed" : "ongoing"
  }

  private repair(creep: Creep, task: BuilderTask): Outcome {
    const target = Game.getObjectById(task.id as Id<Structure>)
    if (!target || (task.goal ?? target.hitsMax) <= target.hits || target.hits === target.hitsMax) return "failed"

    return creep.repair(target) === ERR_NOT_IN_RANGE ? this.approach(creep, target, 3) : "ongoing"
  }

  private build(creep: Creep, task: BuilderTask): Outcome {
    const site = Game.getObjectById(task.id as Id<ConstructionSite>)
    if (!site) return "failed"

    const code = creep.build(site)
    if (code === ERR_NOT_IN_RANGE) return this.approach(creep, site, 3)
    if (code === ERR_INVALID_TARGET) {
      // A creep standing on the site blocks it from being built.
      moveOffTile(creep, site.pos)
      clearTile(site.pos)
    }
    return "ongoing"
  }

  private upgrade(creep: Creep): Outcome {
    const controller = creep.room.controller
    if (!controller || !controller.my) return "failed"

    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 3)
    return "ongoing"
  }

  private collect(creep: Creep, task: BuilderTask): Outcome {
    const target = Game.getObjectById(task.id as Id<EnergyTarget>)
    if (!target || energyIn(target) <= 0) return "failed"

    const code = target instanceof Resource ? creep.pickup(target) : creep.withdraw(target, RESOURCE_ENERGY)
    if (code === ERR_NOT_IN_RANGE) return this.approach(creep, target, 1)
    // Collected: if we're still not full, the next target gets picked next tick (after the store updates).
    return code === OK ? "done" : "failed"
  }

  private harvest(creep: Creep, task: BuilderTask): Outcome {
    const source = Game.getObjectById(task.id as Id<Source>)
    if (!source || source.energy <= 0) return "failed"

    return creep.harvest(source) === ERR_NOT_IN_RANGE ? this.approach(creep, source, 1) : "ongoing"
  }
}

function energyIn(target: EnergyTarget): number {
  return target instanceof Resource ? target.amount : target.store.energy
}

export interface BuilderMemory extends CreepMemory {
  task?: BuilderTask
}
