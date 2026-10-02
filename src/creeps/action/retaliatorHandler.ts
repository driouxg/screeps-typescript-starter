import { end, retaliation, Retaliation, squad } from "defence/retaliation"
import * as creepRoles from "../roles"
import { smartMove } from "./common/movement"
import { park } from "./common/parking"
import ICreepHandler from "./ICreepHandler"

/** Towers with this much energy between them on arrival turn the squad back: they'd outlast it. */
const TOWER_ENERGY_MIN = 100

/**
 * Goal: The squad of a strike on a player who attacked us (see defence/retaliation).
 *
 * While it spawns, wait at home. Then attackers head for the target room and destroy what the player has there: their
 * creeps (fighters first), then their structures (towers, spawns, extensions and the rest, but nothing under a
 * rampart), then containers (their remote mining's). The healer follows the attackers and heals the most hurt of the
 * squad. Arriving to working towers or safe mode, the strike is called off. Once there's nothing left, it's done.
 *
 * When the strike is over, the squad walks home and joins its defenders (attackers become melee defenders, the healer
 * a healer).
 */
export default class RetaliatorHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as RetaliatorMemory
    const r = retaliation()
    if (!r || r.state === "over" || !r.target) return this.retire(creep)
    if (r.state !== "attacking") {
      park(creep)
      return
    }
    if (memory.kind === "healer") this.healer(creep)
    else this.attacker(creep, r, memory)
  }

  private attacker(creep: Creep, r: Retaliation, memory: RetaliatorMemory): void {
    // Hit anything of theirs next to us, on the way or in the fight.
    const adjacent = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 1, { filter: c => c.owner.username === r.player })[0]

    if (creep.room.name !== r.target) {
      if (adjacent) creep.attack(adjacent)
      smartMove(creep, new RoomPosition(25, 25, r.target!), 20) // set: handle() checked
      return
    }

    if (!memory.checked) {
      memory.checked = true
      const why = this.tooStrong(creep.room)
      if (why) return end(r, `called off: ${why} in ${r.target}`)
    }

    let target = memory.targetId ? Game.getObjectById(memory.targetId) : null
    // Gone, or fled the room: don't chase it out.
    if (!target || target.pos.roomName !== r.target) {
      target = this.pickTarget(creep, r)
      memory.targetId = target?.id
    }
    if (!target) return end(r, `done: nothing of ${r.player}'s left to hit in ${r.target}`)

    if (creep.attack(target) === ERR_NOT_IN_RANGE) {
      if (adjacent) creep.attack(adjacent)
      smartMove(creep, target, 1)
    }
  }

  /** Why the squad would lose here, if it would: towers with energy, or safe mode. */
  private tooStrong(room: Room): string | null {
    if (room.controller?.safeMode) return "safe mode"
    const towers = room.find(FIND_HOSTILE_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[]
    const energy = towers.reduce((sum, t) => sum + t.store.energy, 0)
    return TOWER_ENERGY_MIN <= energy ? `${towers.length} tower(s) with energy` : null
  }

  /**
   * Their creeps (fighters first), then their structures (except the controller and anything a rampart covers, which
   * melee can't get through cheaply), then containers. Nearest first.
   */
  private pickTarget(creep: Creep, r: Retaliation): Creep | Structure | null {
    const theirs = creep.room.find(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username === r.player })
    const fighters = theirs.filter(
      c => 0 < c.getActiveBodyparts(ATTACK) || 0 < c.getActiveBodyparts(RANGED_ATTACK) || 0 < c.getActiveBodyparts(HEAL)
    )
    const creepTarget = creep.pos.findClosestByRange(0 < fighters.length ? fighters : theirs)
    if (creepTarget) return creepTarget

    const covered = new Set(
      creep.room
        .find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_RAMPART && !(s as StructureRampart).my })
        .map(s => s.pos.x * 50 + s.pos.y)
    )
    const open = (s: Structure) => !covered.has(s.pos.x * 50 + s.pos.y)
    const order: StructureConstant[] = [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION]
    const structures = creep.room.find(FIND_HOSTILE_STRUCTURES, {
      filter: s =>
        s.owner?.username === r.player &&
        s.structureType !== STRUCTURE_CONTROLLER &&
        s.structureType !== STRUCTURE_RAMPART &&
        open(s)
    })
    for (const type of order) {
      const next = creep.pos.findClosestByRange(structures.filter(s => s.structureType === type))
      if (next) return next
    }
    const rest = creep.pos.findClosestByRange(structures)
    if (rest) return rest

    return creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && open(s)
    })
  }

  /** Follow the attackers and heal the most hurt of the squad. */
  private healer(creep: Creep): void {
    const members = squad().filter(c => c.room.name === creep.room.name)
    const hurt = members
      .filter(c => c.hits < c.hitsMax && creep.pos.inRangeTo(c, 3))
      .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0]
    if (hurt) {
      if (creep.pos.isNearTo(hurt)) creep.heal(hurt)
      else creep.rangedHeal(hurt)
    }

    const attackers = squad().filter(c => (c.memory as RetaliatorMemory).kind === "attacker")
    const lead = creep.pos.findClosestByRange(attackers.filter(c => c.room.name === creep.room.name)) ?? attackers[0]
    if (lead) smartMove(creep, lead, 1)
  }

  /** Strike over: walk home, then join its defenders. */
  private retire(creep: Creep): void {
    const home = creep.memory.room
    if (creep.room.name !== home) {
      smartMove(creep, new RoomPosition(25, 25, home), 20)
      return
    }
    const memory = creep.memory as RetaliatorMemory
    creep.memory.role = memory.kind === "healer" ? creepRoles.HEALER : creepRoles.MELEE_DEFENDER
    delete memory.targetId
    delete memory.checked
  }
}

export interface RetaliatorMemory extends CreepMemory {
  kind: "attacker" | "healer"
  /** What it's attacking. */
  targetId?: Id<Creep | Structure>
  /** It has looked over the target room on arrival (see tooStrong). */
  checked?: boolean
}
