import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { creepsOf, workerBudget, workerSpend } from "./utils/economy"
import { upgraderSpots } from "creeps/action/upgraderHandler"

/** Spots next to the controller container are limited; more upgraders just crowd them. */
const MAX_UPGRADERS = 4

/**
 * Goal: Spend whatever the builders don't on upgrading. Always keep one upgrader once energy is flowing, so the
 * controller progresses (RCL 2 needs only 200) and never downgrades.
 */
export default class UpgraderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.UPGRADER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (!room.memory.buildOrder || !room.controller?.my) return null

    const creeps = creepsOf(room)
    const hasRole = (role: string) => creeps.some(c => c.memory.role === role)
    if (!hasRole(creepRoles.MINER) || !hasRole(creepRoles.HAULER)) return null

    const upgraders = creeps.filter(c => c.memory.role === this.role)
    // No more upgraders than there are spots to work from; the rest would wait by the spawn (they can't move alone).
    const spots = upgraderSpots(room, room.controller).length
    if (Math.min(MAX_UPGRADERS, spots) <= upgraders.length) return null

    const workers = creeps.filter(c => c.memory.role === this.role || c.memory.role === creepRoles.BUILDER)
    if (0 < upgraders.length && workerBudget(room) <= workerSpend(workers)) return null

    return new SpawnConfig(buildCappedBodyParts([WORK], room, 10, [CARRY]), this.role)
  }
}
