import Queue from "roomPlans/utils/Queue"
import IEventEmitter from "./IEventEmitter"
import { CLAIMER } from "creeps/roles"
import { myClaimedRoom } from "utils/roomUtils"

const CREEP_LIFETIME = 1500

export default class SpawnClaimerEventEmitter implements IEventEmitter {
  emit(): void {
    // if (Game.time <= (Memory.claimerTick || 0) + CREEP_LIFETIME) return
    if (Game.time <= (Memory.claimerTick || 0) + 300) return

    // console.log(JSON.stringify(Memory.rooms["W8N3"]))

    if (this.isAtMaxRooms()) return

    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]

      const claimableRoom = this.findClaimableRoom(room)

      if (!claimableRoom) return

      Memory.events.push({
        type: "SPAWN",
        role: CLAIMER,
        handled: false,
        targetRoomName: claimableRoom
      } as any)
      Memory.claimerTick = Game.time

      break
    }
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

    if (room.controller.my) return false

    if (room.controller.reservation && room.controller.reservation.username !== "DryOx") return false

    if (Game.map.getRoomStatus(room.name).status === "closed") return false

    if (room.memory.status !== undefined && room.memory.status !== "claimable") return false

    console.log("ROOM IS CLAIMABLE ***************************", roomName)

    return true
  }
}
