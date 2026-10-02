import { isHostile } from "config/relations"
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

  const dangers = threatsIn(creep.room).filter(d => creep.pos.inRangeTo(d.pos, d.range - 1))
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

/**
 * Hostile fighters in the room and how far to stay from them, cached per room per tick (every creep checks).
 * Source keepers are left out: they never leave their post, and paths already keep out of their reach (see
 * keeperZones). Fleeing them made creeps sneaking past a keeper flee, path back and flee again, a flee search every
 * tick.
 */
function threatsIn(room: Room): { pos: RoomPosition; range: number }[] {
  if (threatCache.tick !== Game.time) threatCache = { tick: Game.time, byRoom: {} }
  return (threatCache.byRoom[room.name] ??= room
    .find(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username !== KEEPER && isCombatant(c) && isHostile(c) })
    .map(h => ({ pos: h.pos, range: reach(h) + 1 })))
}
const KEEPER = "Source Keeper"
let threatCache: { tick: number; byRoom: { [room: string]: { pos: RoomPosition; range: number }[] } } = {
  tick: -1,
  byRoom: {}
}

function reach(hostile: Creep): number {
  return 0 < hostile.getActiveBodyparts(RANGED_ATTACK) ? RANGED_REACH : MELEE_REACH
}
