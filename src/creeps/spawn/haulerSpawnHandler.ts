import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { creepsOf } from "./utils/economy"

const MAX_HAULERS = 8
/** Energy waiting at the sources that justifies each hauler beyond one per miner. */
const BACKLOG_PER_EXTRA_HAULER = 500
const BOOTSTRAP_ENERGY = 200

/**
 * Goal: Carry what the miners produce, without spawning haulers that would stand around.
 *
 * "minimum" keeps one hauler per miner and runs early in the spawn order, so energy starts flowing to the spawn.
 * "backlog" adds haulers only while energy piles up at the sources faster than the current haulers move it.
 */
export default class HaulerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.HAULER

  public constructor(private mode: "minimum" | "backlog") {}

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const creeps = creepsOf(spawn.room)
    const miners = creeps.filter(c => c.memory.role === creepRoles.MINER)
    const haulers = creeps.filter(c => c.memory.role === this.role)

    if (miners.length <= 0 || MAX_HAULERS <= haulers.length) return null

    if (this.mode === "minimum") {
      if (miners.length <= haulers.length) return null
    } else {
      const extras = haulers.length - miners.length + 1
      if (sourceBacklog(spawn.room) < extras * BACKLOG_PER_EXTRA_HAULER) return null
    }

    // The first hauler gets energy flowing to the spawn, so don't wait for a full spawn to build it.
    const minEnergy = haulers.length === 0 ? BOOTSTRAP_ENERGY : undefined
    return new SpawnConfig(
      buildCappedBodyParts([CARRY, MOVE, CARRY, MOVE], spawn.room, 25, undefined, minEnergy),
      this.role
    )
  }
}

/**
 * Energy lying next to sources, on the ground or in containers.
 */
function sourceBacklog(room: Room): number {
  let total = 0
  for (const source of room.find(FIND_SOURCES)) {
    for (const pile of source.pos.findInRange(FIND_DROPPED_RESOURCES, 1))
      if (pile.resourceType === RESOURCE_ENERGY) total += pile.amount
    for (const s of source.pos.findInRange(FIND_STRUCTURES, 1))
      if (s.structureType === STRUCTURE_CONTAINER) total += s.store.energy
  }
  return total
}
