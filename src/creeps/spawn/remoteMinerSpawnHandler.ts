import RemoteMinerMemory from "creeps/memory/remoteMinerMemory"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"

export default class RemoteMinerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number }

  public constructor(creepPopulationDict: { [key: string]: number }) {
    this.creepPopulationDict = creepPopulationDict
  }

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const exits = Game.map.describeExits(spawn.room.name)

    for (let direction in exits) {
      const roomName = exits[direction as ExitKey]

      if (!this.isRoomRemoteMineable(roomName)) continue

      const blueprint = [WORK, CARRY, MOVE]
      if (2 < this.creepPopulationDict[creepRoles.REMOTE_MINER]) return null

      return new SpawnConfig(buildCappedBodyParts(blueprint, spawn.room, 25), creepRoles.REMOTE_MINER, {
        targetRoomName: roomName,
        birthRoomName: spawn.room.name
      } as RemoteMinerMemory)
    }

    return null
  }

  private isRoomRemoteMineable(roomName?: string) {
    if (!roomName) return false

    const room = Game.rooms[roomName]
    if (!room) return false

    if (["claimedMy", "claimedEnemy", "unseen", "hostile"].includes(room.memory.status)) return false
    return true
  }
}
