import * as creepRoles from "../../roles"

/**
 * Goal: Decide how many creeps a room can afford, so spawning doesn't eat the energy that should go into upgrading
 * and building ("too many cooks").
 *
 * income  - energy per tick the room's miners can harvest (plus a discounted share of remote mining)
 * upkeep  - energy per tick needed to keep replacing the creeps we have (body cost spread over their lifetime)
 * spare   - income - upkeep: what's left for workers to spend on upgrading and building
 */

/** Remote energy lost to decay on the way home (the haulers themselves are counted as upkeep). */
const REMOTE_EFFICIENCY = 0.9
/** Share of the time builders spend building rather than walking or collecting (measured with the bench, with build staging). */
export const BUILDER_DUTY_CYCLE = 0.4

const WORKER_ROLES = [creepRoles.UPGRADER, creepRoles.BUILDER]

export function creepsOf(room: Room): Creep[] {
  return Object.values(Game.creeps).filter(c => c.memory.room === room.name)
}

export function bodyCost(body: BodyPartConstant[]): number {
  return body.reduce((sum, part) => sum + BODYPART_COST[part], 0)
}

function upkeepOf(creep: Creep): number {
  const lifetime = creep.body.some(p => p.type === CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME
  return bodyCost(creep.body.map(p => p.type)) / lifetime
}

/**
 * Energy per tick the room's miners harvest: 2 per WORK part (HARVEST_POWER), capped at what each source regenerates.
 */
export function income(room: Room): number {
  const creeps = creepsOf(room)
  let total = 0

  for (const source of room.find(FIND_SOURCES)) {
    const workParts = creeps
      .filter(
        c =>
          c.memory.role === creepRoles.MINER && (c.memory as { targetSourceId?: string }).targetSourceId === source.id
      )
      .reduce((sum, c) => sum + c.getActiveBodyparts(WORK), 0)
    total += Math.min(source.energyCapacity / ENERGY_REGEN_TIME, workParts * HARVEST_POWER)
  }

  // Remote sources being mined: what the miner harvests, discounted for what's lost carrying it home.
  for (const miner of creeps.filter(c => c.memory.role === creepRoles.REMOTE_MINER)) {
    const remote = Memory.remotes?.[(miner.memory as { targetSourceId?: string }).targetSourceId ?? ""]
    if (!remote) continue
    const regen = (remote.reserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME
    total += Math.min(regen, miner.getActiveBodyparts(WORK) * HARVEST_POWER) * REMOTE_EFFICIENCY
  }

  return total
}

/** Energy per tick to keep replacing every non-worker creep. */
export function supportUpkeep(room: Room): number {
  return creepsOf(room)
    .filter(c => !WORKER_ROLES.includes(c.memory.role))
    .reduce((sum, c) => sum + upkeepOf(c), 0)
}

/**
 * Energy per tick workers can spend once support creeps are paid for, after also paying for the workers themselves.
 */
export function workerBudget(room: Room): number {
  const workers = creepsOf(room).filter(c => WORKER_ROLES.includes(c.memory.role))
  const workerUpkeep = workers.reduce((sum, c) => sum + upkeepOf(c), 0)
  return income(room) - supportUpkeep(room) - workerUpkeep + surplus(room)
}

/** Energy kept in hand (on the ground, in containers and storage) for refilling the spawn and emergencies. */
const ENERGY_RESERVE = 1000
/** Spread spending of stockpiled energy over this many ticks. */
const SURPLUS_SPEND_TICKS = 1000

/**
 * Stockpiled energy above ENERGY_RESERVE, as extra energy per tick for workers. Without this a backlog just sits
 * there (and decays, if it's on the ground) because income alone says we can't afford more workers.
 */
export function surplus(room: Room): number {
  const dropped = room
    .find(FIND_DROPPED_RESOURCES, { filter: r => r.resourceType === RESOURCE_ENERGY })
    .reduce((sum, r) => sum + r.amount, 0)
  const stored = room
    .find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE
    })
    .reduce((sum, s) => sum + (s as StructureContainer | StructureStorage).store.energy, 0)
  return Math.max(0, dropped + stored - ENERGY_RESERVE) / SURPLUS_SPEND_TICKS
}

/**
 * Energy per tick the given workers will try to spend: 1 per WORK upgrading, BUILD_POWER per WORK while building.
 */
export function workerSpend(creeps: Creep[]): number {
  return creeps.reduce((sum, c) => {
    const work = c.getActiveBodyparts(WORK)
    if (c.memory.role === creepRoles.UPGRADER) return sum + work * UPGRADE_CONTROLLER_POWER
    if (c.memory.role === creepRoles.BUILDER) return sum + work * BUILD_POWER * BUILDER_DUTY_CYCLE
    return sum
  }, 0)
}
