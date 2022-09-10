import { RemoteHaulerMemory } from "creeps/action/remoteHaulerHandler"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { getOrderedExits, isRoomRemoteMineable } from "./utils/roomUtils"

/**
 * Goal: Spawn a certain number of remote haulers per remote source
 */
export default class RemoteHaulerSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const exits = getOrderedExits(spawn.room) as string[]

    const remoteHaulers = this.getRemoteDropMiners()

    for (let roomName of exits) {
      if (!isRoomRemoteMineable(roomName)) continue
      const mineableRoom = Game.rooms[roomName]
      if (!mineableRoom) continue

      for (let source of mineableRoom.find(FIND_SOURCES)) {
        if (3 <= remoteHaulers.filter(c => (c.memory as RemoteHaulerMemory).targetSourceId === source.id).length)
          continue

        return new SpawnConfig(buildCappedBodyParts([MOVE, CARRY], spawn.room, 15), creepRoles.REMOTE_HAULER, {
          memory: {
            targetSourceId: source.id.toString(),
            birthRoomName: spawn.room.name
          } as RemoteHaulerMemory
        })
      }
    }

    return null
  }

  private getRemoteDropMiners() {
    return Object.keys(Game.creeps)
      .map(c => Game.creeps[c])
      .filter(c => c.memory.role === creepRoles.REMOTE_HAULER)
  }
}
