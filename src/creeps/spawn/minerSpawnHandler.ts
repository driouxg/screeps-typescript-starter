import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { MinerMemory } from "creeps/action/minerHandler"
import { findCachedStructurePositions } from "utils/structureUtils"

const MINER_REPLACEMENT_LEAD = 100

export default class MinerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MINER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const roomMemory = spawn.room.memory

    if (!roomMemory.buildOrder) return null

    if (!roomMemory.minerPositions) roomMemory.minerPositions = this.calcMinerPositions(spawn.room)

    this.calcMinerPositions(spawn.room)

    // A miner about to die doesn't count, so its replacement is spawned and pulled into place before the source
    // goes idle. Miners have no MOVE parts, so replacing one takes spawn time plus the puller's trip.
    const miners = spawn.room.find(FIND_MY_CREEPS, {
      filter: c => c.memory.role === this.role && (c.spawning || MINER_REPLACEMENT_LEAD < (c.ticksToLive ?? 0))
    })

    for (let minerPos of roomMemory.minerPositions) {
      if (miners.some(m => (m.memory as MinerMemory).targetSourceId === minerPos.sourceId)) continue

      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, WORK, WORK, WORK], spawn.room, 5), this.role, {
        memory: {
          targetSourceId: minerPos.sourceId,
          targetSourcePos: minerPos.pos
        } as MinerMemory
      })
    }

    return null
  }

  private calcMinerPositions(room: Room): { sourceId: string; pos: { x: number; y: number; roomName: string } }[] {
    // if none exist, just pick a random spot
    let minerPositions = []
    const containerPositions = findCachedStructurePositions(room, STRUCTURE_CONTAINER)
    const sources = room.find(FIND_SOURCES)

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      for (const containerPos of containerPositions) {
        if (!source.pos.isNearTo(containerPos)) continue

        minerPositions.push({ sourceId: source.id, pos: containerPos })
        break
      }

      // if (minerPositions.length <= i) minerPositions.push({sourceId: source.id, pos: findCl})
    }

    return minerPositions
  }
}
