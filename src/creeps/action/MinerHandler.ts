import { MINER } from "creeps/roles"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Move to target position in creep memory and mine until expiration.
 */
export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    if (creep.memory.role !== MINER) return

    const memory = creep.memory as MinerMemory

    const source = Game.getObjectById(memory.targetSourceId) as Source
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.moveTo(source)
  }
}

export interface MinerMemory extends CreepMemory {
  targetSourceId: string
}
