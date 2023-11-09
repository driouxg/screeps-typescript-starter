import { ClaimerMemory } from "creeps/action/claimerHandler"
import Queue from "utils/queue"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

export default class ClaimerSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (this.isAtMaxRooms()) return null

    const claimableRoom = this.findClaimableRoom(spawn.room)

    if (!claimableRoom) return null

    return new SpawnConfig([MOVE, CLAIM], creepRoles.CLAIMER, {
      memory: { targetRoom: claimableRoom } as ClaimerMemory
    })
  }

  private isAtMaxRooms(): boolean {
    const numRooms = Object.keys(Game.rooms).filter(roomName => {
      const room = Game.rooms[roomName]
      if (!room) return false

      if (!room.controller) return false
      return room.controller.my
    })

    return Game.gcl.level <= numRooms.length
  }

  private findClaimableRoom(room: Room): string | null {
    let q = new Queue<string>()

    q.add(room.name)

    while (0 < q.size() && q.size() < 20) {
      const size = q.size()

      for (let i = 0; i < size; i++) {
        const roomName = q.remove()

        if (!roomName) continue

        if (this.isClaimableRoom(roomName)) return roomName

        // Explore other closest options
        const exits = Game.map.describeExits(roomName)
        if (!exits) continue
        const roomNames = Object.keys(exits).map(direction => exits[direction as ExitKey])

        for (const roomName of roomNames) {
          if (!roomName) continue
          q.add(roomName)
        }
      }
    }

    return null
  }

  private isClaimableRoom(roomName: string) {
    const room = Game.rooms[roomName]

    if (!room) return false

    if (room.controller === undefined) return false

    if (room.find(FIND_SOURCES).length < 2) return false

    if (room.controller.owner !== undefined) return false

    if (room.controller.reservation && room.controller.reservation.username !== "DryOx") return false

    if (Game.map.getRoomStatus(room.name).status === "closed") return false

    if (room.memory.status !== undefined && room.memory.status !== "claimable") return false

    return true
  }
}
