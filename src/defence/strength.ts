/**
 * Goal: A rough measure of how hard a player could hit back, the same for them (from what we've seen of their rooms:
 * intel) and for us (from our rooms now), so the two can be compared (see remote/contest).
 *
 * In energy-like points:
 *   bases   each base's spawn energy capacity times its spawns (how big and how many creeps it can make), from its RCL
 *   towers  TOWER_POINTS each
 *   stored  energy in storage and terminals / STORED_DIVISOR (what a war could be paid with)
 *   army    combat parts (ATTACK, RANGED_ATTACK, HEAL) seen at once * PART_POINTS
 *
 * Only what we've seen counts, so a player is "unknown" (null) until we've seen one of their bases within
 * INTEL_TICKS: a player whose bases we don't know could be anything.
 */

const TOWER_POINTS = 1000
const STORED_DIVISOR = 10
/** About what a combat part costs, with the MOVE it needs. */
const PART_POINTS = 150
/** Intel older than this isn't counted. */
const INTEL_TICKS = 20000

export interface Strength {
  score: number
  bases: number
  towers: number
  stored: number
  /** Combat parts seen at once (theirs: the most seen in one room). */
  army: number
}

/** A player's strength from intel, or null if we know none of their bases. */
export function playerStrength(player: string): Strength | null {
  let bases = 0
  let basePoints = 0
  let towers = 0
  let stored = 0
  let army = 0
  for (const memory of Object.values(Memory.rooms ?? {})) {
    const intel = memory.intel
    if (!intel || INTEL_TICKS < Game.time - intel.tick) continue
    army = Math.max(army, intel.combatParts?.[player] ?? 0)
    if (intel.controller?.owner !== player) continue
    bases++
    basePoints += basePointsAt(intel.controller.level)
    towers += intel.towers ?? 0
    stored += intel.storedEnergy ?? 0
  }
  if (bases <= 0) return null
  return score(bases, basePoints, towers, stored, army)
}

/** Our strength now. */
export function ourStrength(): Strength {
  let bases = 0
  let basePoints = 0
  let towers = 0
  let stored = 0
  for (const room of Object.values(Game.rooms)) {
    if (!room.controller?.my) continue
    bases++
    const spawns = room.find(FIND_MY_SPAWNS).length
    basePoints += room.energyCapacityAvailable * Math.max(1, spawns)
    towers += room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length
    stored += (room.storage?.store.energy ?? 0) + (room.terminal?.store.energy ?? 0)
  }
  let army = 0
  for (const creep of Object.values(Game.creeps))
    army +=
      creep.getActiveBodyparts(ATTACK) + creep.getActiveBodyparts(RANGED_ATTACK) + creep.getActiveBodyparts(HEAL)
  return score(bases, basePoints, towers, stored, army)
}

/** One line for reports: "9200 (2 bases, 3 towers, 40k stored, 12 combat parts)". */
export function describe(s: Strength): string {
  return `${Math.round(s.score)} (${s.bases} base${s.bases === 1 ? "" : "s"}, ${s.towers} towers, ${Math.round(
    s.stored / 1000
  )}k stored, ${s.army} combat parts)`
}

function score(bases: number, basePoints: number, towers: number, stored: number, army: number): Strength {
  return {
    score: basePoints + towers * TOWER_POINTS + stored / STORED_DIVISOR + army * PART_POINTS,
    bases,
    towers,
    stored,
    army
  }
}

/** A base's spawn energy capacity at `level` (all its spawns and extensions) times its spawns. */
function basePointsAt(level: number): number {
  const spawns = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][level] ?? 0
  const extensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][level] ?? 0
  const capacity = spawns * SPAWN_ENERGY_CAPACITY + extensions * (EXTENSION_ENERGY_CAPACITY[level] ?? 0)
  return capacity * Math.max(1, spawns)
}

