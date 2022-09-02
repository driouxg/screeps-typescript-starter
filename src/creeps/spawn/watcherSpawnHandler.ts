import WatcherMemory from "creeps/memory/watcherMemory"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

export default class WatcherSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const spawnRoomMemory = spawn.room.memory

    const exits = Game.map.describeExits(spawn.room.name)

    for (let direction in exits) {
      const roomName = exits[direction as ExitKey]

      if (!this.isRoomWorthWatching(spawn.room, roomName)) continue

      let lastSpawned = spawnRoomMemory.watchers[roomName!] ?? 0

      if (Game.time <= lastSpawned + CREEP_LIFE_TIME) continue

      spawnRoomMemory.watchers[roomName!] = Game.time
      return new SpawnConfig([MOVE], creepRoles.WATCHER, { targetRoomName: roomName } as WatcherMemory)
    }

    return null
  }

  private isRoomWorthWatching(spawnRoom: Room, roomName?: string) {
    if (!roomName) return false

    const room = Game.rooms[roomName]
    if (!room) return false

    if (!spawnRoom.memory.watchers) spawnRoom.memory.watchers = {}

    if (room.memory.status === "claimedMy") return false
    return true
  }
}
