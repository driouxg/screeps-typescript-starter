import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class HaulerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.HAULER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const creeps = spawn.room.find(FIND_MY_CREEPS)
    const miners = creeps.filter(c => c.memory.role === creepRoles.MINER)
    const haulers = creeps.filter(c => c.memory.role === creepRoles.HAULER)

    const bluePrint = [CARRY, MOVE, CARRY, MOVE]

    if (miners.length * 2 <= haulers.length) return null

    return new SpawnConfig(buildCappedBodyParts(bluePrint, spawn.room, 25), this.role)
  }
}
