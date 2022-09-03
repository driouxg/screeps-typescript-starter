import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { MinerMemory } from "creeps/action/minerHandler"
import { jsonToRoomPosition } from "utils/jsonMapper"
import { findCachedStructurePositions } from "utils/structureUtils"

export default class MinerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MINER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const roomMemory = spawn.room.memory

    if (!roomMemory.minerPositions) roomMemory.minerPositions = this.calcMinerPositions(spawn.room)

    this.calcMinerPositions(spawn.room)

    if (this.isEnoughMiners(spawn.room)) return null
    if (0 < roomMemory.events.filter(t => t.type === "PULL_REQUEST").length) return null // Don't try to build a miner if the puller is busy

    for (let minerPos of roomMemory.minerPositions) {
      if (this.isMinerInPos(jsonToRoomPosition(minerPos.pos))) continue

      return new SpawnConfig(buildCappedBodyParts([WORK, WORK, WORK, WORK, WORK], spawn.room, 5), this.role, {
        targetSourceId: minerPos.sourceId,
        targetSourcePos: minerPos.pos
      } as MinerMemory)
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

  private isEnoughMiners(room: Room) {
    const miners = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })

    return room.find(FIND_SOURCES).length <= miners.length
  }

  private isMinerInPos(pos: RoomPosition) {
    const miners = pos.lookFor(LOOK_CREEPS).filter(c => c.my && c.memory.role === creepRoles.MINER)
    return 0 < miners.length
  }
}
