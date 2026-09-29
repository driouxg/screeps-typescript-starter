import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

/** Haulers walk around obstacles, so paths run longer than straight-line range. */
const PATH_FACTOR = 1.2
const MAX_HAULERS = 8

/**
 * Goal: Keep enough CARRY parts to move every source's output to where it's used before it decays on the ground.
 *
 * Each source yields SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME energy per tick (10 for a normal source). Moving
 * that over a round trip of 2 * distance ticks needs 2 * distance * 10 / CARRY_CAPACITY CARRY parts.
 */
export default class HaulerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.HAULER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const creeps = spawn.room.find(FIND_MY_CREEPS)
    const miners = creeps.filter(c => c.memory.role === creepRoles.MINER)
    const haulers = creeps.filter(c => c.memory.role === creepRoles.HAULER)

    if (miners.length <= 0 || MAX_HAULERS <= haulers.length) return null

    // Always have two per miner; add more while there isn't enough carry capacity for the distances involved.
    const carryParts = haulers.reduce((sum, h) => sum + h.getActiveBodyparts(CARRY), 0)
    if (miners.length * 2 <= haulers.length && this.requiredCarryParts(spawn) <= carryParts) return null

    return new SpawnConfig(buildCappedBodyParts([CARRY, MOVE, CARRY, MOVE], spawn.room, 25), this.role)
  }

  private requiredCarryParts(spawn: StructureSpawn): number {
    const { room } = spawn
    const destinations = [spawn.pos, room.controller?.pos].filter((p): p is RoomPosition => p !== undefined)

    let parts = 0
    for (const source of room.find(FIND_SOURCES)) {
      const distance = Math.max(...destinations.map(d => source.pos.getRangeTo(d))) * PATH_FACTOR
      const energyPerTick = source.energyCapacity / ENERGY_REGEN_TIME
      parts += (2 * distance * energyPerTick) / CARRY_CAPACITY
    }
    return Math.ceil(parts)
  }
}
