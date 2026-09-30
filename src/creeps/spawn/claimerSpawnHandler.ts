import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { ClaimerMemory } from "creeps/action/claimerHandler"

/**
 * Goal: One claimer for the current expansion target (see ExpansionPlanner), from the expansion's home room.
 *
 * A CLAIM creep only lives 600 ticks, so it gets two MOVE parts to keep full speed on plain and most swamp.
 */
export default class ClaimerSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const expansion = Memory.expansion
    if (!expansion || expansion.state !== "claiming" || expansion.home !== spawn.room.name) return null

    const claimers = Object.values(Game.creeps).filter(c => c.memory.role === creepRoles.CLAIMER)
    if (0 < claimers.length) return null

    return new SpawnConfig([CLAIM, MOVE, MOVE], creepRoles.CLAIMER, {
      memory: { targetRoom: expansion.target } as ClaimerMemory,
      waitForEnergy: true
    })
  }
}
