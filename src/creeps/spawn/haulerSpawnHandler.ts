import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { creepsOf } from "./utils/economy"
import { baseRoadsBuilt } from "./utils/baseRoads"

const MAX_HAULERS = 8
/** Energy waiting at the sources that justifies each hauler beyond one per miner. */
const BACKLOG_PER_EXTRA_HAULER = 500
const BOOTSTRAP_ENERGY = 200
/** Most CARRY on a road hauler (with half as many MOVE): the same 24-ish parts as the 1:1 body. */
const MAX_ROAD_CARRY = 16

/**
 * Goal: Carry what the miners produce, without spawning haulers that would stand around.
 *
 * "minimum" keeps one hauler per miner and runs early in the spawn order, so energy starts flowing to the spawn.
 * "backlog" adds haulers only while energy piles up at the sources faster than the current haulers move it.
 *
 * Bodies are 1 CARRY per MOVE, until the base's roads are mostly built (see baseRoadsBuilt): then
 * 2 CARRY per MOVE, which still moves a tile per tick when full on roads, so each hauler carries a third more for
 * the same energy.
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
    const body =
      baseRoadsBuilt(spawn.room)
        ? roadBody(spawn.room, minEnergy)
        : buildCappedBodyParts([CARRY, MOVE, CARRY, MOVE], spawn.room, 25, undefined, minEnergy)
    return new SpawnConfig(body, this.role)
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

/**
 * 2 CARRY per MOVE, in whole sets: a set cut short (more than 2 CARRY per MOVE) would slow a full hauler even on
 * roads. As many as the energy available allows, up to MAX_ROAD_CARRY; none below `minEnergy` (default: a full spawn).
 */
function roadBody(room: Room, minEnergy: number = SPAWN_ENERGY_CAPACITY): BodyPartConstant[] {
  if (room.energyAvailable < minEnergy) return []
  const set = 2 * BODYPART_COST[CARRY] + BODYPART_COST[MOVE]
  const sets = Math.min(MAX_ROAD_CARRY / 2, Math.floor(room.energyAvailable / set))
  return [...Array<BodyPartConstant>(2 * sets).fill(CARRY), ...Array<BodyPartConstant>(sets).fill(MOVE)]
}
