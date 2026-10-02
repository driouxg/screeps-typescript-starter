import { contestOf } from "remote/contest"
import * as creepRoles from "../roles"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Clear another player's creeps out of a remote room we're taking from them (see remote/contest): their
 * fighters first, then their reserver (its CLAIM parts keep their reservation up), then the rest. With none left,
 * guard the controller, where our reserver works. Hits anything of theirs next to it on the way.
 *
 * When the contest is over (won or given up), it goes home and joins the defenders there.
 */
export default class ContesterHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ContesterMemory
    const contest = contestOf(memory.targetRoom)
    if (!contest) return this.retire(creep)
    if (!memory.counted) {
      contest.attackersSpawned++
      memory.counted = true
    }

    const theirs = (c: Creep) => c.owner.username === contest.player
    const adjacent = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1, { filter: theirs })[0]
    if (creep.room.name !== memory.targetRoom) {
      if (adjacent) creep.attack(adjacent)
      const controller = Memory.rooms[memory.targetRoom]?.intel?.controller
      smartMove(creep, new RoomPosition(controller?.x ?? 25, controller?.y ?? 25, memory.targetRoom), 3)
      return
    }

    let target = memory.targetId ? Game.getObjectById(memory.targetId) : null
    if (!target || target.room?.name !== memory.targetRoom) {
      target = this.pickTarget(creep, theirs)
      memory.targetId = target?.id
    }
    if (target) {
      if (creep.attack(target) === ERR_NOT_IN_RANGE) {
        if (adjacent) creep.attack(adjacent)
        smartMove(creep, target, 1)
      }
      return
    }
    const controller = creep.room.controller
    if (controller) smartMove(creep, controller, 2)
  }

  /** Their fighters, then their reservers, then anything else of theirs; nearest first. */
  private pickTarget(creep: Creep, theirs: (c: Creep) => boolean): Creep | null {
    const all = creep.room.find(FIND_HOSTILE_CREEPS, { filter: theirs })
    const has = (c: Creep, ...parts: BodyPartConstant[]) => parts.some(p => 0 < c.getActiveBodyparts(p))
    const fighters = all.filter(c => has(c, ATTACK, RANGED_ATTACK, HEAL))
    const reservers = all.filter(c => has(c, CLAIM))
    return (
      creep.pos.findClosestByRange(fighters) ??
      creep.pos.findClosestByRange(reservers) ??
      creep.pos.findClosestByRange(all)
    )
  }

  /** Contest over: home, then a defender there. */
  private retire(creep: Creep): void {
    const home = creep.memory.room
    if (creep.room.name !== home) {
      smartMove(creep, new RoomPosition(25, 25, home), 20)
      return
    }
    const memory = creep.memory as ContesterMemory
    delete memory.targetId
    creep.memory.role = creepRoles.MELEE_DEFENDER
  }
}

export interface ContesterMemory extends CreepMemory {
  targetRoom: string
  targetId?: Id<Creep>
  /** Counted against its contest's attackers (see remote/contest). */
  counted?: boolean
}
