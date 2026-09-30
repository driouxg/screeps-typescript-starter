import { RapidFillerMemory } from "creeps/action/rapidFillerHandler"
import { rapidFillOf } from "structures/rapidFill"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { creepsOf } from "./utils/economy"

/**
 * Measured in the bench (A/B at RCL 3, 4 and 5): fillers lowered upgrade + build output by 12-23%, because a fuller
 * spawn builds bigger creeps and the fillers' own upkeep, while haulers handle 10-30 extensions fine. They pay off
 * once spawning is the bottleneck: two spawns running near nonstop and 100-energy extensions from RCL 7.
 */
const MIN_RCL = 7
const MAX_CARRY = 6
/** A spot needs this many built spawns/extensions around it before a filler there beats haulers doing it. */
const MIN_FILLABLE = 3

/**
 * Goal: One filler per rapid fill spot with at least MIN_FILLABLE things to fill, once the rapid fill has somewhere to take energy
 * from (a container or the link). Fillers only walk once, onto their spot, so they need a single MOVE; CARRY is sized
 * so a filler holds a few extensions' worth.
 */
export default class RapidFillerSpawnHandler implements ISpawnHandler {
  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if ((room.controller?.level ?? 0) < MIN_RCL) return null
    const rapidFill = rapidFillOf(room)
    if (!rapidFill) return null

    const hasSupply = [...rapidFill.containers, rapidFill.link].some(p =>
      p
        .lookFor(LOOK_STRUCTURES)
        .some(s => s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_LINK)
    )
    if (!hasSupply) return null

    const taken = creepsOf(room)
      .filter(c => c.memory.role === creepRoles.RAPID_FILLER)
      .map(c => (c.memory as RapidFillerMemory).spot)
    const spot = rapidFill.spots.find(
      p =>
        !taken.some(t => t && t.x === p.x && t.y === p.y) &&
        MIN_FILLABLE <=
          p
            .findInRange(FIND_MY_STRUCTURES, 1)
            .filter(s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION).length
    )
    if (!spot) return null

    // 2 CARRY early on, growing with capacity (bigger extensions later) up to MAX_CARRY.
    const carry = Math.max(2, Math.min(MAX_CARRY, Math.floor(room.energyCapacityAvailable / 200)))
    const body = [...Array<BodyPartConstant>(carry).fill(CARRY), MOVE]

    return new SpawnConfig(body, creepRoles.RAPID_FILLER, {
      memory: { spot: { x: spot.x, y: spot.y } } as RapidFillerMemory,
      // Straight onto the spot when this spawn is next to it.
      directions: spawn.pos.isNearTo(spot) ? [spawn.pos.getDirectionTo(spot)] : undefined
    })
  }
}
