import { isHostile } from "config/relations"
import { recordIntel } from "expansion/intel"
import { nextScoutTarget, scoutArrived } from "expansion/scouting"
import { myUsername } from "utils/username"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * A scout's body is all MOVE, so it never tires and crosses a room in well under this many ticks; stuck in one room
 * longer than this, it has no way to its target and picks another.
 */
const STUCK_TICKS = 200

/**
 * Goal: Find out what's in the rooms around home (see expansion/intel), for remote mining and expansion.
 *
 * Each time it reaches its target, the scout records the room and heads for the next one (see expansion/scouting:
 * unseen rooms nearest home first, then the stalest). Rooms it passes through are recorded on the way.
 */
export default class ScoutHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    memory.targetRoom = memory.targetRoom ?? creep.memory.room
    if (memory.lastRoom !== creep.room.name) {
      memory.lastRoom = creep.room.name
      memory.enteredRoom = Game.time
      scoutArrived(creep.room.name)
    }

    if (creep.room.name === memory.targetRoom) {
      smartMove(creep, new RoomPosition(25, 25, creep.room.name), 20) // Move creep off of border
      this.updateRoomStatus(creep.room)
      recordIntel(creep.room, true)

      memory.targetRoom = nextScoutTarget(creep.memory.room, creep.room.name) ?? creep.room.name
      return
    }

    // No progress towards the target: it can't be reached from here (the attempt is already counted against it).
    if (STUCK_TICKS < Game.time - (memory.enteredRoom ?? Game.time)) {
      memory.targetRoom = nextScoutTarget(creep.memory.room, creep.room.name) ?? creep.room.name
      memory.enteredRoom = Game.time
      return
    }
    smartMove(creep, new RoomPosition(25, 25, memory.targetRoom), 20)
  }

  private updateRoomStatus(room: Room) {
    const me = myUsername()
    let status: RoomMemory["status"] = "unseen"

    if (!room.controller) status = "unclaimable"
    else if (room.controller.my) status = "claimedMy"
    else if (room.controller.owner) status = "claimedEnemy"
    else if (room.controller.reservation?.username === me) status = "reservedMy"
    else if (room.controller.reservation) status = "reservedEnemy"
    else if (
      0 <
      room.find(FIND_HOSTILE_CREEPS, {
        filter: c => isHostile(c) && (0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK))
      }).length
    )
      status = "aggressive"

    room.memory.lastScouted = Game.time
    room.memory.status = status
  }
}

export interface ScoutMemory extends CreepMemory {
  targetRoom: string
  /** The room the scout is in, and when it got there (see STUCK_TICKS). */
  lastRoom?: string
  enteredRoom?: number
}
