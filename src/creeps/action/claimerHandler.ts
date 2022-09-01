import ClaimerMemory from "creeps/memory/claimerMemory"
import Queue from "utils/queue"
import CreepBehavior from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Try to expand to closest claimable room.
 */
export default class ClaimerHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior

  public constructor(creepBehavior: CreepBehavior) {
    this.creepBehavior = creepBehavior
  }

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

      if (status === ERR_NOT_IN_RANGE) this.creepBehavior.moveToWithSinglePath(creep, controller.pos)
      if (status === ERR_GCL_NOT_ENOUGH) creep.suicide()
    } else creep.moveTo(new RoomPosition(25, 25, memory.targetRoom))
  }

  private findClaimableRoom(creep: Creep): string {
    let q = new Queue<string>()

    q.add(creep.room.name)

    while (0 < q.size()) {
      const size = q.size()

      for (let i = 0; i < size; i++) {
        const roomName = q.remove()

        if (!roomName || !this.isClaimableRoom(roomName)) continue

        if (this.isClaimableRoom(roomName)) return roomName

        // Explore other closest options
        const exits = Game.map.describeExits(roomName)
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
    const room = new Room(roomName)

    return (
      room &&
      room.controller &&
      !room.controller?.owner &&
      (!room.controller.reservation || room.controller.reservation?.username === "DryOx") &&
      room.find(FIND_HOSTILE_CREEPS).length <= 0 &&
      Game.map.getRoomStatus(room.name)
    )
  }
}
