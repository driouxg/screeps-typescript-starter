import ScoutMemory from "creeps/memory/scoutMemory"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Explore to random rooms, if claimable, claim the controller.
 */
export default class ScoutHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    memory.targetRoom = memory.targetRoom ?? creep.memory.room

    if (creep.room.name === memory.targetRoom) {
      creep.moveTo(25, 25) // Move creep off of border
      this.updateRoomStatus(creep.room)

      memory.targetRoom = this.findNewTargetRoom(creep)
    } else creep.moveTo(new RoomPosition(25, 25, memory.targetRoom))
  }

  private findNewTargetRoom(creep: Creep): string {
    const exits = Game.map.describeExits(creep.room.name)
    const roomNames = Object.keys(exits).map(direction => exits[direction as ExitKey])
    let memory = creep.memory as ScoutMemory
    roomNames.sort(() => Math.random() - 0.5)

    for (const roomName of roomNames) {
      if (!roomName) continue

      const room = Game.rooms[roomName]

      const lastScouted = room ? room.memory.lastScouted : 0

      if (Game.time < lastScouted - 100) continue

      return roomName
    }

    return memory.targetRoom
  }

  private updateRoomStatus(room: Room) {
    let status = "unseen"

    if (!room.controller) status = "unclaimable"
    else if (room.controller?.my) status = "claimedMy"
    else if (room.controller && !room.controller?.owner) status = "claimable"
    else if (room.controller?.reservation && room.controller.reservation.username === "DryOx") status = "reservedMy"
    else if (room.controller?.reservation && room.controller.reservation.username !== "DryOx") status = "reservedEnemy"

    room.memory.lastScouted = Game.time
    room.memory.status = status as "unseen" | "reservedMy" | "reservedEnemy" | "claimedMy" | "claimedEnemy"
  }
}
