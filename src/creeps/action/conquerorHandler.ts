import { isHostile } from "config/relations"
import { Conquest, conquest, ConquerorMemory, conquerors, rallyPoint, squadOf } from "conquest/conquest"
import { smartMove as move, stepOffEdge } from "./common/movement"
import { park } from "./common/parking"
import ICreepHandler from "./ICreepHandler"

/** Squad members out of this range of the leader hold the march up. */
const MARCH_SPREAD = 3
/** The order squads form up in: the leader is the first of these it has. */
const LEAD_ORDER = ["dismantler", "attacker", "ranged", "healer"]

/**
 * Goal: The squads of a conquest (see conquest/conquest), by kind (see conquest/squadMeta):
 *   dismantler  takes down what the squad is focused on (a barrier on the way in, a tower, a spawn);
 *   attacker    hits their creeps next to it, otherwise the focus;
 *   ranged      shoots their creeps within 3, otherwise the focus;
 *   healer      follows the leader and heals the most hurt of the squad in reach (or pre-heals the leader under fire);
 *   claimer     runs their controller's downgrade timer down once their towers and spawns are gone.
 *
 * Its wave waiting at home: renewing at a spawn when told to (rallying), otherwise parked. Marching: the leader (a
 * dismantler, or whatever fighter the squad has) walks to the staging room and waits for anyone more than MARCH_SPREAD
 * behind; the others follow it. Engaged (and any older wave still alive): fight, or pull back to the staging room with
 * the whole squad while it heals. When the conquest is over, it walks home and is recycled.
 */
export default class ConquerorHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ConquerorMemory
    const c = conquest()
    if (!c || c.room !== memory.conquest || c.state === "over") return this.retire(creep)

    this.heal(creep, c)
    // On an exit tile (just arrived, or pushed): one step in first, or the next step along the edge bounces it into
    // the next room. Attacks this tick still happen below; stepOffEdge used this tick's move.
    if (stepOffEdge(creep)) memory.steppedIn = Game.time
    if (memory.kind === "claimer") return this.claimer(creep, c)
    const veteran = memory.wave < c.wave
    if (!veteran && c.state === "marching") return this.march(creep, c)
    if (!veteran && c.state !== "engaged") return this.wait(creep, c)
    this.fight(creep, c)
  }

  /** At home while the wave spawns and rallies: renew when told to, otherwise out of the way. */
  private wait(creep: Creep, c: Conquest): void {
    if (creep.room.name !== c.home) {
      smartMove(creep, new RoomPosition(25, 25, c.home), 20)
      return
    }
    if (creep.memory.renewing) {
      const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS)
      if (spawn) smartMove(creep, spawn, 1)
      return
    }
    park(creep)
  }

  private march(creep: Creep, c: Conquest): void {
    this.hitAdjacent(creep, c)
    const wave = squadOf(c, (creep.memory as ConquerorMemory).wave)
    const leader = leaderOf(wave)
    if (!leader || leader.id !== creep.id) {
      if (leader) smartMove(creep, leader, 1)
      return
    }
    const onBorder = creep.pos.x <= 0 || 49 <= creep.pos.x || creep.pos.y <= 0 || 49 <= creep.pos.y
    const behind = wave.some(m => m.id !== creep.id && (m.room.name !== creep.room.name || MARCH_SPREAD < creep.pos.getRangeTo(m)))
    // Wait for stragglers, but never on an exit tile: it would bounce back into the last room.
    if (behind && !onBorder) return
    smartMove(creep, rallyPoint(c), 2)
  }

  private fight(creep: Creep, c: Conquest): void {
    const memory = creep.memory as ConquerorMemory
    const enemies = (range: number) =>
      creep.pos.findInRange(FIND_HOSTILE_CREEPS, range, { filter: h => h.owner.username === c.player || isHostile(h) })

    if (c.retreating) {
      this.hitAdjacent(creep, c)
      smartMove(creep, rallyPoint(c), 2)
      return
    }

    const wave = squadOf(c, memory.wave)
    const leader = leaderOf(wave) ?? leaderOf(squadOf(c))
    if (memory.kind === "healer") {
      if (leader && leader.id !== creep.id) smartMove(creep, leader, 1)
      else smartMove(creep, rallyPoint(c), 2)
      return
    }

    if (c.phase === "drain") return this.drain(creep, c, leader, enemies)

    const focus = c.focus ? Game.getObjectById(c.focus.id as Id<Structure>) : null
    const focusPos = c.focus ? new RoomPosition(c.focus.x, c.focus.y, c.room) : this.corePos(c)

    if (memory.kind === "ranged") {
      const target = creep.pos.findClosestByRange(enemies(3))
      if (target) creep.rangedAttack(target)
      else if (focus && creep.pos.inRangeTo(focus, 3)) creep.rangedAttack(focus)
      const hunted = creep.room.name === c.room ? creep.pos.findClosestByRange(enemies(10)) : null
      if (hunted) smartMove(creep, hunted, 3)
      else if (leader && leader.id !== creep.id && creep.room.name === c.room) smartMove(creep, leader, 2)
      else smartMove(creep, focusPos, 3)
      return
    }

    // Dismantlers and attackers.
    const adjacent = enemies(1)[0]
    if (memory.kind === "attacker" && adjacent) {
      creep.attack(adjacent)
      return
    }
    if (focus && creep.pos.isNearTo(focus)) {
      if (memory.kind === "dismantler") creep.dismantle(focus)
      else creep.attack(focus)
      return
    }
    // Inside their room, keep the healers in reach: don't step ahead of them under tower fire.
    const healers = wave.filter(m => (m.memory as ConquerorMemory).kind === "healer")
    if (creep.room.name === c.room && healers.length && healers.every(h => h.room.name !== creep.room.name || 2 < creep.pos.getRangeTo(h)))
      return
    smartMove(creep, focusPos, 1)
  }

  /**
   * Draining their towers: hold the edge tile they hit least (the healers follow the leader there); fighters kill
   * their creeps that come close, and go after miners at sources outside their walls.
   */
  private drain(creep: Creep, c: Conquest, leader: Creep | undefined, enemies: (range: number) => Creep[]): void {
    const memory = creep.memory as ConquerorMemory
    const hold = new RoomPosition(c.hold?.x ?? c.entry.x, c.hold?.y ?? c.entry.y, c.room)
    const ranged = memory.kind === "ranged"
    const target = creep.pos.findClosestByRange(enemies(ranged ? 3 : 1))
    if (target) {
      if (ranged) creep.rangedAttack(target)
      else if (memory.kind === "attacker") creep.attack(target)
    }
    if (memory.kind === "dismantler") {
      if (!leader || leader.id === creep.id) smartMove(creep, hold, 0)
      else smartMove(creep, leader, 1)
      return
    }
    // Miners at exposed sources.
    const exposed = Memory.rooms[c.room]?.siege?.exposed ?? []
    const miner =
      creep.room.name === c.room
        ? creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
            filter: h => h.owner.username === c.player && exposed.some(e => h.pos.inRangeTo(e.x, e.y, 2))
          })
        : null
    if (miner) smartMove(creep, miner, ranged ? 3 : 1)
    else smartMove(creep, hold, 1)
  }

  /** Their spawn (or the controller) from the siege intel, for when there's nothing to focus on. */
  private corePos(c: Conquest): RoomPosition {
    const siege = Memory.rooms[c.room]?.siege
    const spawn = siege?.spawns[0]
    const controller = Memory.rooms[c.room]?.intel?.controller
    return new RoomPosition(spawn?.x ?? controller?.x ?? 25, spawn?.y ?? controller?.y ?? 25, c.room)
  }

  /** Heal the most hurt of the conquest's creeps in reach; with none hurt, pre-heal a fighter next to it under fire. */
  private heal(creep: Creep, c: Conquest): void {
    if (creep.getActiveBodyparts(HEAL) <= 0) return
    const near = conquerors(c.room).filter(m => m.room.name === creep.room.name && creep.pos.inRangeTo(m, 3))
    const hurt = near.filter(m => m.hits < m.hitsMax).sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax)[0]
    if (hurt) {
      if (creep.pos.isNearTo(hurt)) creep.heal(hurt)
      else creep.rangedHeal(hurt)
      return
    }
    if (creep.room.name !== c.room) return
    const fighter = near.find(m => m.id !== creep.id && creep.pos.isNearTo(m) && (m.memory as ConquerorMemory).kind !== "healer")
    creep.heal(fighter ?? creep)
  }

  private hitAdjacent(creep: Creep, c: Conquest): void {
    const ranged = 0 < creep.getActiveBodyparts(RANGED_ATTACK)
    const melee = 0 < creep.getActiveBodyparts(ATTACK)
    if (!ranged && !melee) return
    const target = creep.pos.findInRange(FIND_HOSTILE_CREEPS, ranged ? 3 : 1, {
      filter: h => h.owner.username === c.player || isHostile(h)
    })[0]
    if (!target) return
    if (melee && creep.pos.isNearTo(target)) creep.attack(target)
    else if (ranged) creep.rangedAttack(target)
  }

  /** Run their controller down: attack it whenever it can be attacked, and wait next to it in between. */
  private claimer(creep: Creep, c: Conquest): void {
    const intel = Memory.rooms[c.room]?.intel?.controller
    const controller = creep.room.name === c.room ? creep.room.controller : undefined
    if (!controller) {
      smartMove(creep, new RoomPosition(intel?.x ?? 25, intel?.y ?? 25, c.room), 1)
      return
    }
    if (!creep.pos.isNearTo(controller)) {
      smartMove(creep, controller, 1)
      return
    }
    if (!controller.owner || controller.my || controller.upgradeBlocked || controller.safeMode) return
    if (creep.attackController(controller) === OK) {
      c.nextClaimAttack = Game.time + CONTROLLER_ATTACK_BLOCKED_UPGRADE
      console.log(`Conquest ${c.room}: attacked their controller (${controller.ticksToDowngrade} ticks to downgrade)`)
    }
  }

  /** Conquest over: home, and recycled at a spawn for some of its energy back. */
  private retire(creep: Creep): void {
    delete creep.memory.renewing
    const home = creep.memory.room
    if (creep.room.name !== home) {
      smartMove(creep, new RoomPosition(25, 25, home), 20)
      return
    }
    const spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS)
    if (!spawn) return park(creep)
    if (spawn.recycleCreep(creep) === ERR_NOT_IN_RANGE) smartMove(creep, spawn, 1)
  }
}

/** smartMove that keeps off exit tiles inside the room it's in, and doesn't override a step off the edge this tick. */
function smartMove(creep: Creep, target: RoomPosition | { pos: RoomPosition }, range: number): void {
  if ((creep.memory as ConquerorMemory).steppedIn === Game.time) return
  move(creep, target, range, { avoidEdges: true })
}

/** The member the squad forms up on: its first dismantler (or attacker, ranged, healer), lowest slot first. */
function leaderOf(members: Creep[]): Creep | undefined {
  const rank = (m: Creep) => {
    const memory = m.memory as ConquerorMemory
    return LEAD_ORDER.indexOf(memory.kind) * 100 + memory.slot
  }
  return members.filter(m => !m.spawning).sort((a, b) => rank(a) - rank(b))[0]
}
