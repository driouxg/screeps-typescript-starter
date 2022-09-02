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
    const exits = this.getUnorderedExits(spawn.room) as string[]
    const population = 2 * exits.filter(e => this.isRoomRemoteMineable(e)).length

    for (let roomName of exits) {
      if (!this.isRoomRemoteMineable(roomName)) continue

      const blueprint = [WORK, CARRY, MOVE]
      if (population <= this.creepPopulationDict[creepRoles.REMOTE_MINER]) return null

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
    // should still remote mine if claimed unless spawn is in room
    if (["claimedMy", "claimedEnemy", "unseen", "hostile", "unclaimable"].includes(room.memory.status)) return false
    return true
  }

  private getUnorderedExits(room: Room) {
    const exits = Game.map.describeExits(room.name)
    const roomNames = Object.keys(exits).map(direction => exits[direction as ExitKey])

    return roomNames.sort(() => Math.random() - 0.5)
  }
}
