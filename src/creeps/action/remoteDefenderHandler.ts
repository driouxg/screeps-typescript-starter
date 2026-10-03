import { isHostile } from "config/relations"
import { hostileFighters } from "defence/remoteDefence"
import { sendHome } from "remote/remoteCreeps"
import { loiter, stopLoitering } from "./common/loiter"
import { smartMove, stepOffEdge } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Keep closing in on where an enemy was last seen for this long after it vanished: a raider chasing our creeps steps
 * back and forth across an exit, out of the room every other tick, and heading off elsewhere in between kept the
 * defender swinging between two tiles.
 */
const CHASE_TICKS = 10
/** A ranged defender keeps melee hostiles at least this far off (they hit from 1, and close a tile a tick). */
const KITE_RANGE = 3
/** rangedMassAttack damage by range (1, 2, 3); a plain rangedAttack does RANGED_ATTACK_POWER to one target. */
const MASS_DAMAGE = [0, 10, 4, 1]

/**
 * Goal: Clear hostiles out of a room where they threaten our remote mining (see defence/remoteDefence), then do the
 * same wherever else this home is threatened, or wait at home.
 *
 * Every tick it hits what's in reach, whatever it's moving towards: melee parts the hostile next to it, ranged parts
 * (sent against ranged raiders, see remoteDefenderBody) the best target within 3, or all of them at once when that
 * does more (rangedMassAttack); a HEAL part heals it when hurt. Then it moves: towards the nearest hostile fighter
 * (and healer) in the room it's in, or in the room it defends any hostile; a ranged defender stops at 3 tiles, and
 * backs off from melee hostiles that come closer. Otherwise it heads for that room. Between fights it waits near where
 * the hostiles died, off the roads (see loiter), not in the way of the creeps getting back to work.
 *
 * A raider on the room's edge steps across the exit and back, in the room every other tick: the defender waits within
 * reach of where it vanished (CHASE_TICKS), so it's hit each time it steps back in. It never steps onto an exit tile
 * itself: that carried it into the next room, out of the fight, and back.
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

    this.strike(creep)
    const ranged = 0 < creep.getActiveBodyparts(RANGED_ATTACK) && creep.getActiveBodyparts(ATTACK) <= 0
    const move = (target: RoomPosition | { pos: RoomPosition }, range: number) =>
      smartMove(creep, target, range, { avoidEdges: true })
    // Just arrived, or pushed onto the edge: a step in first, or the next step along it leaves the room.
    if (stepOffEdge(creep)) return

    const here = creep.room.name === memory.targetRoom
    const enemy =
      creep.pos.findClosestByRange(hostileFighters(creep.room)) ??
      (here ? creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, { filter: isHostile }) : null)

    if (enemy) {
      stopLoitering(creep)
      memory.lastEnemy = { x: enemy.pos.x, y: enemy.pos.y, roomName: enemy.pos.roomName, tick: Game.time }
      if (!ranged) {
        if (!creep.pos.isNearTo(enemy)) move(enemy, 1)
        return
      }
      const range = creep.pos.getRangeTo(enemy)
      if (0 < enemy.getActiveBodyparts(ATTACK) && range < KITE_RANGE) this.backOff(creep, enemy)
      else if (KITE_RANGE < range) move(enemy, KITE_RANGE)
      return
    }

    const last = memory.lastEnemy
    if (last && last.roomName === creep.room.name && Game.time - last.tick <= CHASE_TICKS) {
      // Within reach of where it vanished, for when it steps back in (off the edge: see the top of this file).
      move(new RoomPosition(last.x, last.y, last.roomName), ranged ? KITE_RANGE - 1 : 1)
      return
    }
    delete memory.lastEnemy
    if (!memory.targetRoom) return sendHome(creep)
    if (!here) move(new RoomPosition(25, 25, memory.targetRoom), 20)
    else loiter(creep)
  }

  /** Hit what's in reach this tick (see the top of this file), and heal itself when hurt. */
  private strike(creep: Creep): void {
    const near = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: isHostile })
    const fights = (c: Creep) =>
      0 < c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) + c.getActiveBodyparts(HEAL)
    // Fighters first, then the most hurt (the quickest kill).
    const best = (targets: Creep[]) =>
      targets.sort((a, b) => Number(fights(b)) - Number(fights(a)) || a.hits - b.hits)[0] as Creep | undefined

    let meleeTarget: Creep | undefined
    if (0 < creep.getActiveBodyparts(ATTACK)) {
      meleeTarget = best(near.filter(c => creep.pos.isNearTo(c)))
      if (meleeTarget) creep.attack(meleeTarget)
    }
    if (0 < creep.getActiveBodyparts(RANGED_ATTACK) && near.length) {
      const mass = near.reduce((sum, c) => sum + MASS_DAMAGE[creep.pos.getRangeTo(c)], 0)
      if (RANGED_ATTACK_POWER < mass) creep.rangedMassAttack()
      else {
        const target = best(near)
        if (target) creep.rangedAttack(target)
      }
    }
    // Healing shares an action with melee attacks: only when it didn't hit anything in melee.
    if (!meleeTarget && 0 < creep.getActiveBodyparts(HEAL) && creep.hits < creep.hitsMax) creep.heal(creep)
  }

  /** Step away from a melee hostile that's come too close, staying in the room and off its exits. */
  private backOff(creep: Creep, enemy: Creep): void {
    const result = PathFinder.search(creep.pos, { pos: enemy.pos, range: KITE_RANGE }, {
      flee: true,
      maxRooms: 1,
      roomCallback: roomName => {
        const matrix = new PathFinder.CostMatrix()
        for (let i = 0; i < 50; i++) {
          matrix.set(i, 0, 0xff)
          matrix.set(i, 49, 0xff)
          matrix.set(0, i, 0xff)
          matrix.set(49, i, 0xff)
        }
        const room = Game.rooms[roomName]
        for (const s of room?.find(FIND_STRUCTURES) ?? []) {
          if (s.structureType === STRUCTURE_ROAD) matrix.set(s.pos.x, s.pos.y, 1)
          else if (s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && s.my))
            matrix.set(s.pos.x, s.pos.y, 0xff)
        }
        for (const c of room?.find(FIND_CREEPS) ?? []) matrix.set(c.pos.x, c.pos.y, 0xff)
        return matrix
      }
    })
    if (0 < result.path.length) creep.move(creep.pos.getDirectionTo(result.path[0]))
  }
}

export interface RemoteDefenderMemory extends CreepMemory {
  /** Room it's defending; none when there's nothing to defend. */
  targetRoom?: string
  /** Where it last saw an enemy, and when (see CHASE_TICKS). */
  lastEnemy?: { x: number; y: number; roomName: string; tick: number }
}
