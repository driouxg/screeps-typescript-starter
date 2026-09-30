/**
 * Goal: Size up hostiles in a room against what we can put against them, so defence reacts to real threats and
 * ignores harmless ones (scouts, NPC-free rooms).
 *
 * Damage per tick uses the game's constants: ATTACK_POWER per ATTACK part, RANGED_ATTACK_POWER per RANGED_ATTACK
 * part, HEAL_POWER per HEAL part. Towers are counted at their average damage over their range.
 */

/** A tower hits for 600 up close and 150 at range 20+; count the average so we don't overestimate. */
const TOWER_AVERAGE_DAMAGE = (TOWER_POWER_ATTACK + TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)) / 2

export interface Threat {
  hostiles: Creep[]
  /** Damage per tick the hostiles can deal. */
  damage: number
  /** Hits per tick the hostiles can heal. */
  healing: number
}

export function isCombatant(creep: Creep): boolean {
  return 0 < creep.getActiveBodyparts(ATTACK) || 0 < creep.getActiveBodyparts(RANGED_ATTACK)
}

export function creepDamage(creep: Creep): number {
  return creep.getActiveBodyparts(ATTACK) * ATTACK_POWER + creep.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER
}

/** Hostile creeps in the room that can fight or heal; scouts and haulers aren't a threat. */
export function assessThreat(room: Room): Threat {
  const hostiles = room.find(FIND_HOSTILE_CREEPS, {
    filter: c => isCombatant(c) || 0 < c.getActiveBodyparts(HEAL)
  })
  return {
    hostiles,
    damage: hostiles.reduce((sum, c) => sum + creepDamage(c), 0),
    healing: hostiles.reduce((sum, c) => sum + c.getActiveBodyparts(HEAL) * HEAL_POWER, 0)
  }
}

/** Damage per tick our towers (with energy to fire) and combat creeps in the room can deal. */
export function defensiveDamage(room: Room): number {
  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER && TOWER_ENERGY_COST <= s.store.energy
  })
  const defenders = room.find(FIND_MY_CREEPS, { filter: c => isCombatant(c) })
  return towers.length * TOWER_AVERAGE_DAMAGE + defenders.reduce((sum, c) => sum + creepDamage(c), 0)
}

/** Whether our towers and defenders out-damage the hostiles' damage and healing by a safe margin. */
export function canWin(room: Room, threat: Threat, margin = 1.5): boolean {
  return (threat.damage + threat.healing) * margin <= defensiveDamage(room)
}

/** How many of our creeps hostiles have killed since `since` (tombstones of creeps that died before old age). */
export function creepsKilledSince(room: Room, since: number): number {
  return room.find(FIND_TOMBSTONES, {
    filter: t => t.creep.my && since <= t.deathTime && 1 < (t.creep.ticksToLive ?? 0)
  }).length
}
