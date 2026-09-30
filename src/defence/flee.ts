import { applyCreepCosts } from "creeps/action/common/movement"
import { isCombatant } from "./threat"

/**
 * Goal: Keep creeps that can't fight out of reach of hostile fighters instead of letting them be picked off.
 *
 * A melee fighter can hit anything it can step next to (range 2 counting its next move); a ranged one reaches 3
 * tiles, plus a step. Creeps inside that reach step away. Nothing flees while our safe mode is on, since hostiles
 * can't act then.
 */
const MELEE_REACH = 2
const RANGED_REACH = 4

/** Returns true if the creep is fleeing this tick, in which case its role should not act. */
export function fleeIfThreatened(creep: Creep): boolean {
  if (creep.spawning || isCombatant(creep) || creep.getActiveBodyparts(MOVE) <= 0) return false
  const controller = creep.room.controller
  if (controller?.my && controller.safeMode) return false

  const dangers = creep.room
    .find(FIND_HOSTILE_CREEPS, { filter: isCombatant })
    .map(h => ({ pos: h.pos, range: reach(h) + 1 }))
    .filter(d => creep.pos.inRangeTo(d.pos, d.range - 1))
  if (dangers.length <= 0) return false

  const result = PathFinder.search(creep.pos, dangers, {
    flee: true,
    maxRooms: 1,
    roomCallback: roomName => {
      const room = Game.rooms[roomName]
      const matrix = new PathFinder.CostMatrix()
      if (!room) return matrix
      for (const s of room.find(FIND_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD) matrix.set(s.pos.x, s.pos.y, 1)
        else if (s.structureType !== STRUCTURE_CONTAINER && !(s.structureType === STRUCTURE_RAMPART && s.my))
          matrix.set(s.pos.x, s.pos.y, 0xff)
      }
      return applyCreepCosts(roomName, matrix)
    }
  })
  if (0 < result.path.length) creep.move(creep.pos.getDirectionTo(result.path[0]))
  return true
}

function reach(hostile: Creep): number {
  return 0 < hostile.getActiveBodyparts(RANGED_ATTACK) ? RANGED_REACH : MELEE_REACH
}
