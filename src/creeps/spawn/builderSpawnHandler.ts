import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { creepsOf, workerBudget, workerSpend } from "./utils/economy"
import { defencesBelow, isDefence, RAMPART_MIN_HITS } from "structures/rampartPolicy"
import { DEFENCE_MIN_RCL } from "structures/construction/buildOrderConstructor"
import { isUnderAttack } from "defence/threat"
import { baseRoadsBuilt } from "./utils/baseRoads"

/**
 * Before the first extensions a builder has only 1 WORK part, so it takes this many to spend what two sources yield;
 * with 4, energy piled up and decayed while the RCL 2 extensions took ~1000 ticks longer (measured with the bench).
 */
const MAX_BUILDERS = 8
/** Share of the worker budget builders get while there's something to build; upgraders get the rest. */
const BUILD_SHARE = 0.6
/** RCL 2 needs only 200 upgrade progress; building before then (containers, roads) just delays extensions. */
const MIN_RCL = 2
/**
 * Repeating body unit (see builderBody). 1 WORK : 2 CARRY : 2 MOVE measured best with build staging: carrying
 * capacity decides how long a builder works per refill; WORK-heavy bodies built 2-3x less.
 */
const BUILDER_UNIT: BodyPartConstant[] = [WORK, CARRY, CARRY, MOVE, MOVE]
/** Once the base's roads are built (see baseRoadsBuilt): the same parts without the MOVE, which are added as needed. */
const ROAD_UNIT: BodyPartConstant[] = [WORK, CARRY, CARRY]
const MAX_BUILDER_PARTS = 20
/**
 * Builders the "first" step keeps from the start, ahead of extra haulers: with nothing to build they upgrade (see
 * BuilderHandler.work), and they're already there when RCL 2 unlocks the extensions.
 */
const FIRST_BUILDERS = 2

/**
 * Goal: Enough builders to spend BUILD_SHARE of the spare energy on construction, and one to repair when there's
 * nothing to build.
 */
export default class BuilderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.BUILDER

  /** "first": FIRST_BUILDERS once a miner and a hauler work, from RCL 1. "budget": more, sized by the energy budget. */
  public constructor(private mode: "first" | "budget" = "budget") {}

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (!room.controller?.my) return null

    const creeps = creepsOf(room)
    const builders = creeps.filter(c => c.memory.role === this.role)
    if (this.mode === "first") {
      const hasRole = (role: string) => creeps.some(c => c.memory.role === role)
      if (!hasRole(creepRoles.MINER) || !hasRole(creepRoles.HAULER) || FIRST_BUILDERS <= builders.length) return null
      return new SpawnConfig(builderBody(room.energyAvailable, baseRoadsBuilt(room)), this.role)
    }

    if (room.controller.level < MIN_RCL) return null
    if (MAX_BUILDERS <= builders.length) return null

    const hasSites = 0 < room.find(FIND_MY_CONSTRUCTION_SITES).length
    if (!hasSites) {
      if (0 < builders.length || !this.needsRepair(room)) return null
    } else if (0 < builders.length && workerBudget(room) * BUILD_SHARE <= workerSpend(builders)) return null

    return new SpawnConfig(builderBody(room.energyAvailable, baseRoadsBuilt(room)), this.role)
  }

  /** Damaged structures, or (from DEFENCE_MIN_RCL, or under attack) ramparts and walls running low. */
  private needsRepair(room: Room): boolean {
    const keepDefences = isUnderAttack(room) || DEFENCE_MIN_RCL <= (room.controller?.level ?? 0)
    return (
      0 < room.find(FIND_STRUCTURES, { filter: s => !isDefence(s) && s.hits < s.hitsMax * 0.8 }).length ||
      (keepDefences && 0 < defencesBelow(room, RAMPART_MIN_HITS).length)
    )
  }
}

/**
 * Repeat BUILDER_UNIT as often as the energy allows (up to MAX_BUILDER_PARTS), then add parts of the next unit
 * while they fit. With `roads` (the base's roads are built), ROAD_UNIT's parts instead, each with the MOVE it takes
 * to keep 1 MOVE per 2 other parts: a tile per tick on roads even when loaded. Parts are grouped by type: WORK, CARRY,
 * MOVE.
 */
export function builderBody(energy: number, roads = false): BodyPartConstant[] {
  if (roads) return roadBuilderBody(energy)
  // Less than one whole unit would leave out CARRY or MOVE, and a builder that can't move is stuck for good.
  if (energy < BUILDER_UNIT.reduce((sum, p) => sum + BODYPART_COST[p], 0)) return []

  const parts: BodyPartConstant[] = []
  let cost = 0
  for (let i = 0; parts.length < MAX_BUILDER_PARTS; i = (i + 1) % BUILDER_UNIT.length) {
    const part = BUILDER_UNIT[i]
    if (energy < cost + BODYPART_COST[part]) break
    parts.push(part)
    cost += BODYPART_COST[part]
  }
  const order: BodyPartConstant[] = [WORK, CARRY, MOVE]
  return parts.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

function roadBuilderBody(energy: number): BodyPartConstant[] {
  const parts: BodyPartConstant[] = []
  let cost = 0
  let moves = 0
  for (let i = 0; ; i = (i + 1) % ROAD_UNIT.length) {
    const part = ROAD_UNIT[i]
    const others = parts.length - moves + 1
    const extraMoves = Math.ceil(others / 2) - moves
    const extraCost = BODYPART_COST[part] + extraMoves * BODYPART_COST[MOVE]
    if (energy < cost + extraCost || MAX_BUILDER_PARTS < parts.length + 1 + extraMoves) break
    parts.push(part, ...Array<BodyPartConstant>(extraMoves).fill(MOVE))
    cost += extraCost
    moves += extraMoves
  }
  // Less than one whole unit would leave out WORK or CARRY.
  if (parts.filter(p => p !== MOVE).length < ROAD_UNIT.length) return []
  const order: BodyPartConstant[] = [WORK, CARRY, MOVE]
  return parts.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}
