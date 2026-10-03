import { controls } from "config/controls"
import { isHostile } from "config/relations"
import { recordIntel } from "expansion/intel"
import { nextScoutTarget, scoutArrived, wellScouted } from "expansion/scouting"
import { completeScoutRequest, requestOpen } from "expansion/scoutRequests"
import { scoutableRooms } from "expansion/scoutRange"
import { isHostileRoom } from "utils/roomSafety"
import { myUsername } from "utils/username"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * A scout's body is all MOVE, so it never tires and crosses a room in well under this many ticks; stuck in one room
 * longer than this, it has no way to its target and picks another.
 */
const STUCK_TICKS = 200
/** With no room to target, a scout wanders and looks for one again this often. */
const RETARGET_TICKS = 50

/**
 * Goal: Find out what's in the rooms around home (see expansion/intel), for remote mining and expansion, as cheaply as
 * possible: a scout only ever paths to the exit of the room it's in (never across several rooms), worked out once per
 * room.
 *
 * Two modes:
 * - targeted, while the area isn't well scouted (see wellScouted): heads for a chosen room (see expansion/scouting:
 *   unseen rooms nearest home first, then the stalest), room by room along the map route, records it on arrival and
 *   picks the next.
 * - wandering, once it is: on entering each room, records it (at most every so often, see recordIntel) and walks on
 *   to the neighbour seen longest ago, staying within scouting range. No target searches, no route planning.
 *
 * Rooms the player asks for (see expansion/scoutRequests) go to recon scouts (see ReconHandler, which walks there with
 * request() below). A routine scout still holding a request from before then finishes it first.
 *
 * With scouting switched off (see config/controls) scouts retire, except on a request: the player asked for that.
 */
export default class ScoutHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    const home = creep.memory.room
    if (memory.requestRoom && !requestOpen(memory.requestRoom, creep)) delete memory.requestRoom
    if (!controls().scouting && !memory.requestRoom) {
      creep.suicide()
      return
    }

    if (memory.lastRoom !== creep.room.name) {
      memory.previousRoom = memory.lastRoom
      memory.lastRoom = creep.room.name
      memory.enteredRoom = Game.time
      delete memory.exit
      scoutArrived(creep.room.name)
      if (wellScouted(home)) {
        delete memory.targetRoom
        this.updateRoomStatus(creep.room)
        recordIntel(creep.room)
      }
    }

    if (memory.requestRoom) this.request(creep, memory, memory.requestRoom)
    else if (wellScouted(home)) this.wander(creep, memory)
    else this.target(creep, memory)
  }

  /** Straight to the room the player asked for, room by room; there, record it and report back (see ReconHandler). */
  protected request(creep: Creep, memory: ScoutMemory, room: string): void {
    if (creep.room.name === room) {
      this.updateRoomStatus(creep.room)
      recordIntel(creep.room, true)
      completeScoutRequest(room)
      delete memory.requestRoom
      delete memory.targetRoom
      delete memory.exit
      smartMove(creep, new RoomPosition(25, 25, room), 20) // off the exit tile
      return
    }
    if (!memory.exit) {
      const route = Game.map.findRoute(creep.room.name, room, {
        routeCallback: name => (name !== room && isHostileRoom(name) ? Infinity : 1)
      })
      const next = route !== ERR_NO_PATH ? route[0]?.room : undefined
      if (!next || !this.setExit(creep, memory, next)) return // no way from here: the request times out
    }
    this.walkToExit(creep, memory)
  }

  private target(creep: Creep, memory: ScoutMemory): void {
    const home = creep.memory.room
    const due = Game.time >= (memory.retargetAt ?? 0)
    if ((!memory.targetRoom && due) || creep.room.name === memory.targetRoom) {
      if (creep.room.name === memory.targetRoom) {
        this.updateRoomStatus(creep.room)
        recordIntel(creep.room, true)
      }
      delete memory.exit
      memory.targetRoom = nextScoutTarget(home, creep.room.name) ?? undefined
      // Nothing left to pick: walk on as if wandering, and only look again every RETARGET_TICKS.
      if (!memory.targetRoom) memory.retargetAt = Game.time + RETARGET_TICKS
    }
    if (!memory.targetRoom) return this.wander(creep, memory)

    // No progress towards the target: it can't be reached from here (the attempt is already counted against it).
    if (STUCK_TICKS < Game.time - (memory.enteredRoom ?? Game.time)) {
      memory.targetRoom = nextScoutTarget(home, creep.room.name) ?? undefined
      memory.enteredRoom = Game.time
      delete memory.exit
      return
    }

    if (!memory.exit) {
      const route = Game.map.findRoute(creep.room.name, memory.targetRoom, {
        routeCallback: name => (name !== memory.targetRoom && isHostileRoom(name) ? Infinity : 1)
      })
      const next = route !== ERR_NO_PATH ? route[0]?.room : undefined
      if (!next || !this.setExit(creep, memory, next)) {
        delete memory.targetRoom // unreachable: pick another next tick
        return
      }
    }
    this.walkToExit(creep, memory)
  }

  private wander(creep: Creep, memory: ScoutMemory): void {
    if (!memory.exit) {
      const range = scoutableRooms(creep.memory.room)
      const neighbours = Object.values(Game.map.describeExits(creep.room.name) ?? {}).filter(
        (name): name is string => !!name && (range.has(name) || name === creep.memory.room) && !isHostileRoom(name)
      )
      // Don't turn straight back unless it's a dead end.
      const onward = neighbours.filter(n => n !== memory.previousRoom)
      const options = (0 < onward.length ? onward : neighbours).sort(
        (a, b) => seenAt(a) - seenAt(b) || Math.random() - 0.5
      )
      if (options.length <= 0 || !this.setExit(creep, memory, options[0])) return
    }
    this.walkToExit(creep, memory)
  }

  /** Remember the exit tile towards `next` nearest the scout (by path, worked out once per room). */
  private setExit(creep: Creep, memory: ScoutMemory, next: string): boolean {
    const direction = Game.map.findExit(creep.room.name, next)
    if (direction < 0) return false
    const exit = creep.pos.findClosestByPath(direction as ExitConstant)
    if (!exit) return false
    memory.exit = { x: exit.x, y: exit.y }
    return true
  }

  /** Step onto the remembered exit tile; the game moves the scout into the next room from there. */
  private walkToExit(creep: Creep, memory: ScoutMemory): void {
    const exit = new RoomPosition(memory.exit!.x, memory.exit!.y, creep.room.name)
    if (smartMove(creep, exit, 0) === ERR_NO_PATH) delete memory.exit
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

/** When a room's intel was last recorded; never-seen rooms first. */
function seenAt(roomName: string): number {
  return Memory.rooms[roomName]?.intel?.tick ?? -Infinity
}

export interface ScoutMemory extends CreepMemory {
  targetRoom?: string
  /** A room the player asked to scout (see expansion/scoutRequests). */
  requestRoom?: string
  /** The room the scout is in, and when it got there (see STUCK_TICKS); the room it came from. */
  lastRoom?: string
  enteredRoom?: number
  previousRoom?: string
  /** With nothing to target, when to look again (see RETARGET_TICKS). */
  retargetAt?: number
  /** The exit tile of the current room it's walking to. */
  exit?: { x: number; y: number }
}
