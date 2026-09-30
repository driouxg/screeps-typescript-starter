import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { creepsOf, workerBudget, workerSpend } from "./utils/economy"
import { defencesBelow, isDefence, RAMPART_MIN_HITS } from "structures/rampartPolicy"

const MAX_BUILDERS = 4
/** Share of the worker budget builders get while there's something to build; upgraders get the rest. */
const BUILD_SHARE = 0.6
/** RCL 2 needs only 200 upgrade progress; building before then (containers, roads) just delays extensions. */
const MIN_RCL = 2
/**
 * Repeating body unit (see builderBody). 1 WORK : 2 CARRY : 2 MOVE measured best with build staging: carrying
 * capacity decides how long a builder works per refill; WORK-heavy bodies built 2-3x less.
 */
const BUILDER_UNIT: BodyPartConstant[] = [WORK, CARRY, CARRY, MOVE, MOVE]
const MAX_BUILDER_PARTS = 20

/**
 * Goal: Enough builders to spend BUILD_SHARE of the spare energy on construction, and one to repair when there's
 * nothing to build.
 */
export default class BuilderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.BUILDER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (!room.controller || room.controller.level < MIN_RCL) return null

    const creeps = creepsOf(room)
    const builders = creeps.filter(c => c.memory.role === this.role)
    if (MAX_BUILDERS <= builders.length) return null

    const hasSites = 0 < room.find(FIND_MY_CONSTRUCTION_SITES).length
    if (!hasSites) {
      if (0 < builders.length || !this.needsRepair(room)) return null
    } else if (0 < builders.length && workerBudget(room) * BUILD_SHARE <= workerSpend(builders)) return null

    return new SpawnConfig(builderBody(room.energyAvailable), this.role)
  }

  private needsRepair(room: Room): boolean {
    return (
      0 < room.find(FIND_STRUCTURES, { filter: s => !isDefence(s) && s.hits < s.hitsMax * 0.8 }).length ||
      0 < defencesBelow(room, RAMPART_MIN_HITS).length
    )
  }
}

/**
 * Repeat BUILDER_UNIT as often as the energy allows (up to MAX_BUILDER_PARTS), then add parts of the next unit
 * while they fit. Parts are grouped by type: WORK, CARRY, MOVE.
 */
export function builderBody(energy: number): BodyPartConstant[] {
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
