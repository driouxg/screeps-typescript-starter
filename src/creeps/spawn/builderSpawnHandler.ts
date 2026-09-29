import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { creepsOf, workerBudget, workerSpend } from "./utils/economy"

const MAX_BUILDERS = 4
/** Share of the worker budget builders get while there's something to build; upgraders get the rest. */
const BUILD_SHARE = 0.6
/** RCL 2 needs only 200 upgrade progress; building before then (containers, roads) just delays extensions. */
const MIN_RCL = 2

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

    return new SpawnConfig(buildCappedBodyParts([WORK, WORK, CARRY, MOVE], room, 20), this.role)
  }

  private needsRepair(room: Room): boolean {
    return (
      0 <
      room.find(FIND_STRUCTURES, { filter: s => s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax * 0.8 })
        .length
    )
  }
}
