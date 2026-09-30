/**
 * Goal: Keep ramparts (and walls) alive and growing without sinking every spare energy into them.
 *
 * A rampart is built with 1 hit and loses RAMPART_DECAY_AMOUNT (300) hits every RAMPART_DECAY_TIME (100) ticks, so a
 * new one disappears at its first decay unless repaired straight away. Walls don't decay but are also built with 1 hit.
 *
 * - Below RAMPART_MIN_HITS a rampart is at risk: builders repair it before anything else, and towers top it up.
 * - Up to rampartTarget(room) builders reinforce them when there's nothing to build; the target grows with RCL,
 *   as the room's income and its attackers do.
 */

/** About 1600 ticks of decay: repaired first, by builders and towers. */
export const RAMPART_MIN_HITS = 5000
/** About to decay away: towers repair these even out of their defence reserve. */
export const RAMPART_CRITICAL_HITS = 1000

const TARGET_BY_RCL = [0, 0, 10000, 30000, 100000, 300000, 1000000, 3000000, 10000000]

export function rampartTarget(room: Room): number {
  return TARGET_BY_RCL[room.controller?.level ?? 0] ?? 0
}

/** Our ramparts and walls in the room below `hits`, weakest first. */
export function defencesBelow(room: Room, hits: number): (StructureRampart | StructureWall)[] {
  const defences = room.find(FIND_STRUCTURES, {
    filter: s =>
      ((s.structureType === STRUCTURE_RAMPART && s.my) || s.structureType === STRUCTURE_WALL) && s.hits < hits
  }) as (StructureRampart | StructureWall)[]
  return defences.sort((a, b) => a.hits - b.hits)
}

export function isDefence(s: Structure): boolean {
  return s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL
}
