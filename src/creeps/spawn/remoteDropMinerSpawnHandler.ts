import { RemoteDropMinerMemory } from "creeps/action/remoteDropMinerHandler"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { getOrderedExits, isRoomRemoteMineable, REMOTE_MINING_MIN_RCL } from "./utils/roomUtils"

/**
 * Goal: Look at remote mineable rooms and see if # remote miners === # sources. If not, spawn a remote miner for that room.
 */
export default class RemoteDropMinerSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if ((spawn.room.controller?.level ?? 0) < REMOTE_MINING_MIN_RCL) return null

    const exits = getOrderedExits(spawn.room) as string[]

    const remoteMiners = this.getRemoteDropMiners()

    for (let roomName of exits) {
      if (!isRoomRemoteMineable(roomName)) continue
      const mineableRoom = Game.rooms[roomName]
      if (!mineableRoom) continue

      for (let source of mineableRoom.find(FIND_SOURCES)) {
        if (0 < remoteMiners.filter(c => (c.memory as RemoteDropMinerMemory).targetSourceId === source.id).length)
          continue

        return new SpawnConfig(buildCappedBodyParts([WORK], spawn.room, 4, [MOVE]), creepRoles.REMOTE_DROP_MINER, {
          memory: {
            targetSourceId: source.id.toString()
          } as RemoteDropMinerMemory
        })
      }
    }

    return null
  }

  private getRemoteDropMiners() {
    return Object.keys(Game.creeps)
      .map(c => Game.creeps[c])
      .filter(c => c.memory.role === creepRoles.REMOTE_DROP_MINER)
  }
}
