import { isRemoteRoomActive, sendHome } from "remote/remoteCreeps"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Keep a remote room's controller reserved, which doubles its sources (3000 energy per regeneration instead
 * of 1500). Goes home while the room is paused or no longer mined.
 */
export default class ReserverHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const roomName = (creep.memory as ReserverMemory).targetRoom
    if (!roomName || !isRemoteRoomActive(roomName)) return sendHome(creep)

    const intel = Memory.rooms[roomName]?.intel?.controller
    const controller = creep.room.name === roomName ? creep.room.controller : undefined
    if (!controller) {
      if (intel) smartMove(creep, new RoomPosition(intel.x, intel.y, roomName), 1)
      return
    }
    if (creep.reserveController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 1)
  }
}

export interface ReserverMemory extends CreepMemory {
  targetRoom: string
}
