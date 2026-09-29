import { smartMove } from "./common/movement"
import Queue from "utils/queue"
import { moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Try to expand to closest claimable room.
 */
export default class ClaimerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    let memory = creep.memory as ClaimerMemory
    memory.targetRoom = memory.targetRoom ?? creep.room.name

    if (creep.room.name === memory.targetRoom) {
      if (!this.isClaimableRoom(creep.room.name)) {
        memory.targetRoom = this.findClaimableRoom(creep)
        return
      }

      const controller = creep.room.controller as StructureController
      const status = creep.claimController(controller)

      if (status === ERR_NOT_IN_RANGE) moveToWithSinglePath(creep, controller.pos)
      if (status === ERR_GCL_NOT_ENOUGH) creep.suicide()
    } else smartMove(creep, new RoomPosition(25, 25, memory.targetRoom), 20)
  }

  private findClaimableRoom(creep: Creep): string {
    let q = new Queue<string>()

    q.add(creep.room.name)

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

    return creep.room.name
  }

  private isClaimableRoom(roomName: string) {
    const room = Game.rooms[roomName]

    if (!room) return false

    if (room.controller === undefined) return false

    if (room.find(FIND_SOURCES).length < 2) return false

    if (room.controller.owner) return false

    if (room.controller.reservation && room.controller.reservation.username !== "DryOx") return false

    if (Game.map.getRoomStatus(room.name).status === "closed") return false

    if (room.memory.status !== undefined && room.memory.status === "aggressive") return false

    return true
  }
}

export interface ClaimerMemory extends CreepMemory {
  targetRoom: string
}
