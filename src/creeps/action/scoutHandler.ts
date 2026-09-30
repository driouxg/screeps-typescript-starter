import { recordIntel } from "expansion/intel"
import { myUsername } from "utils/username"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/** How far (in rooms) scouts explore from the room they were spawned in. */
const SCOUT_RANGE = 6

/**
 * Goal: Keep intel on the rooms around us fresh (see expansion/intel), for remote mining and expansion.
 *
 * Each time it reaches its target, the scout records the room and heads for the room within SCOUT_RANGE whose
 * intel is oldest (never-seen rooms first), nearest first on ties.
 */
export default class ScoutHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    memory.targetRoom = memory.targetRoom ?? creep.memory.room

    if (creep.room.name === memory.targetRoom) {
      smartMove(creep, new RoomPosition(25, 25, creep.room.name), 20) // Move creep off of border
      this.updateRoomStatus(creep.room)
      recordIntel(creep.room, true)

      memory.targetRoom = this.findNewTargetRoom(creep)
    } else smartMove(creep, new RoomPosition(25, 25, memory.targetRoom), 20)
  }

  private findNewTargetRoom(creep: Creep): string {
    const home = creep.memory.room
    const lastSeen = (name: string) => Memory.rooms[name]?.intel?.tick ?? -Infinity

    let best: { name: string; seen: number; distance: number } | null = null
    for (const [name, distance] of roomsWithin(home, SCOUT_RANGE)) {
      if (name === creep.room.name || Memory.rooms[name]?.status === "aggressive") continue
      const seen = lastSeen(name)
      if (!best || seen < best.seen || (seen === best.seen && distance < best.distance)) best = { name, seen, distance }
    }

    return best?.name ?? creep.room.name
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
        filter: c => 0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK)
      }).length
    )
      status = "aggressive"

    room.memory.lastScouted = Game.time
    room.memory.status = status
  }
}

/**
 * Rooms reachable within `range` exits of `from` (breadth first), with their distance. Uses the map's exits, so it
 * needs no vision.
 */
function roomsWithin(from: string, range: number): Map<string, number> {
  const distances = new Map<string, number>([[from, 0]])
  let frontier = [from]
  for (let d = 1; d <= range && 0 < frontier.length; d++) {
    const next: string[] = []
    for (const room of frontier) {
      const exits = Game.map.describeExits(room) ?? {}
      for (const name of Object.values(exits)) {
        if (!name || distances.has(name)) continue
        distances.set(name, d)
        next.push(name)
      }
    }
    frontier = next
  }
  return distances
}

export interface ScoutMemory extends CreepMemory {
  targetRoom: string
}
