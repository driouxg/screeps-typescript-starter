import { isHostile } from "config/relations"
import { hostileFighters } from "defence/remoteDefence"
import { sendHome } from "remote/remoteCreeps"
import { loiter, stopLoitering } from "./common/loiter"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Keep closing in on where an enemy was last seen for this long after it vanished: a raider chasing our creeps steps
 * back and forth across an exit, out of the room every other tick, and heading off elsewhere in between kept the
 * defender swinging between two tiles.
 */
const CHASE_TICKS = 10

/**
 * Goal: Clear hostiles out of a room where they threaten our remote mining (see defence/remoteDefence), then do the
 * same wherever else this home is threatened, or wait at home.
 *
 * Fights hostile fighters (and healers) in whatever room it's in, nearest first, and in the room it defends any other
 * hostile creep too; otherwise heads for that room. Hits anything hostile next to it on the way. Between fights it
 * waits near where the hostiles died, off the roads (see loiter), not in the way of the creeps getting back to work. The room counts as
 * clear once it's been seen without hostiles for a while (see remoteDefence), which lets mining resume.
 */
export default class RemoteDefenderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as RemoteDefenderMemory
    const threats = Memory.remoteThreats ?? {}
    const mine = (room: string) => threats[room]?.home === creep.memory.room && 0 < threats[room].defenders
    if (!memory.targetRoom || !mine(memory.targetRoom)) {
      // Done here (or never sent): the nearest other room of ours under threat, if any.
      memory.targetRoom = Object.keys(threats)
        .filter(mine)
        .sort(
          (a, b) =>
            Game.map.getRoomLinearDistance(creep.room.name, a) - Game.map.getRoomLinearDistance(creep.room.name, b)
        )[0]
    }

    const here = creep.room.name === memory.targetRoom
    const enemy =
      creep.pos.findClosestByRange(hostileFighters(creep.room)) ??
      (here ? creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, { filter: isHostile }) : null)
    const passing = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1, { filter: isHostile })[0]

    if (enemy) {
      stopLoitering(creep)
      memory.lastEnemy = { x: enemy.pos.x, y: enemy.pos.y, roomName: enemy.pos.roomName, tick: Game.time }
      if (creep.attack(enemy) === ERR_NOT_IN_RANGE) {
        if (passing) creep.attack(passing)
        smartMove(creep, enemy, 1)
      }
      return
    }

    if (passing) creep.attack(passing)
    const last = memory.lastEnemy
    if (last && last.roomName === creep.room.name && Game.time - last.tick <= CHASE_TICKS) {
      smartMove(creep, new RoomPosition(last.x, last.y, last.roomName), 1)
      return
    }
    delete memory.lastEnemy
    if (!memory.targetRoom) return sendHome(creep)
    if (!here) smartMove(creep, new RoomPosition(25, 25, memory.targetRoom), 20)
    else loiter(creep)
  }
}

export interface RemoteDefenderMemory extends CreepMemory {
  /** Room it's defending; none when there's nothing to defend. */
  targetRoom?: string
  /** Where it last saw an enemy, and when (see CHASE_TICKS). */
  lastEnemy?: { x: number; y: number; roomName: string; tick: number }
}
