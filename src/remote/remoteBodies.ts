/**
 * Goal: The bodies of remote mining creeps, in one place, so the RemotePlanner prices exactly what the spawn builds.
 */

const cost = (body: BodyPartConstant[]) => body.reduce((sum, p) => sum + BODYPART_COST[p], 0)
const parts = (n: number, part: BodyPartConstant) => Array<BodyPartConstant>(Math.max(0, n)).fill(part)

/** WORK parts a miner needs to drain a source: 2 energy each per tick. */
export function workNeeded(income: number): number {
  return Math.ceil(income / HARVEST_POWER)
}

/**
 * Remote miner: one WORK more than the source needs (5 for an unreserved source's 5/tick, 6 for a reserved one's
 * 10/tick), so it has ticks to spare for keeping its container and nearby roads repaired; 1 CARRY to hold the energy
 * it repairs with; 3 MOVE, enough for its one walk out, or 2 once the highway is built (`roads`): on roads its 7 other
 * parts move every 2 ticks with either. At RCL 4: 5 WORK, 1 CARRY, 3 MOVE (700) or 6 WORK (750).
 * Less WORK if the room can't afford it, but never less than the source needs, nor less than 1.
 */
export function minerBody(capacity: number, income: number, roads = false): BodyPartConstant[] {
  const moves = roads ? 2 : 3
  const extras = [CARRY, ...parts(moves, MOVE)] as BodyPartConstant[]
  const affordable = Math.floor((capacity - cost(extras)) / BODYPART_COST[WORK])
  const work = Math.max(1, Math.min(workNeeded(income) + 1, affordable))
  return [...parts(work, WORK), CARRY, ...parts(moves, MOVE)]
}

/** Haulers carry at most this many CARRY (16 CARRY, 8 MOVE: 1200 energy, at RCL 4). */
export const MAX_HAULER_CARRY = 16
const HAULER_CARRY_PER_MOVE = 2

/**
 * Remote hauler: CARRY and MOVE only, 2 CARRY per MOVE: a tile per tick when full over roads, half that (a fifth on
 * swamp) off them, and a tile per tick anywhere when empty (see roundTrip); it's what makes a highway pay. As many
 * CARRY as `wanted` and the room's energy capacity allow, up to MAX_HAULER_CARRY.
 */
export function haulerBody(capacity: number, wanted = MAX_HAULER_CARRY): BodyPartConstant[] {
  const perMove = HAULER_CARRY_PER_MOVE
  const unitCost = perMove * BODYPART_COST[CARRY] + BODYPART_COST[MOVE]
  const units = Math.max(
    1,
    Math.min(Math.floor(capacity / unitCost), Math.ceil(Math.min(wanted, MAX_HAULER_CARRY) / perMove))
  )
  return [...parts(units * perMove, CARRY), ...parts(units, MOVE)]
}

/** Energy and body parts per CARRY part of a hauler (its MOVE share included). */
export function haulerCostPerCarry(): { energy: number; parts: number } {
  const perMove = HAULER_CARRY_PER_MOVE
  return { energy: BODYPART_COST[CARRY] + BODYPART_COST[MOVE] / perMove, parts: 1 + 1 / perMove }
}

/** Highway maintainer: 4 WORK, 4 CARRY, 4 MOVE (800), smaller if the room can't afford it. */
export function maintainerBody(capacity: number): BodyPartConstant[] {
  const unitCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE]
  const units = Math.max(1, Math.min(4, Math.floor(capacity / unitCost)))
  return [...parts(units, WORK), ...parts(units, CARRY), ...parts(units, MOVE)]
}

export function bodyCost(body: BodyPartConstant[]): number {
  return cost(body)
}
