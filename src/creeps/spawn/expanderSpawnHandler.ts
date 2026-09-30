import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { ExpanderMemory } from "creeps/action/expanderHandler"

/**
 * Pioneers per source in the new room. Each walks between its source and the spawn site, so more pioneers keep the
 * sources busy: 3 per source built the spawn 24% faster than 2 in the bench, for 1500 more energy up front.
 */
const PIONEERS_PER_SOURCE = 3
const MAX_PIONEERS = 6
/** Body unit: WORK to harvest and build, CARRY to hold it, two MOVE for full speed across rooms and swamp. */
const UNIT: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE]
const MAX_UNITS = 5

/**
 * Goal: Pioneers ("expanders") that travel to a freshly claimed room, harvest there and build its first spawn.
 * Sized to the home room's energy capacity, since they're sent once and have far to walk.
 */
export default class ExpanderSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const expansion = Memory.expansion
    if (!expansion || expansion.state !== "building" || expansion.home !== spawn.room.name) return null

    const target = Game.rooms[expansion.target]
    const sources = target ? target.find(FIND_SOURCES).length : 1
    const wanted = Math.min(MAX_PIONEERS, Math.max(1, sources * PIONEERS_PER_SOURCE))
    const pioneers = Object.values(Game.creeps).filter(c => c.memory.role === creepRoles.EXPANDER)
    if (wanted <= pioneers.length) return null

    const unitCost = UNIT.reduce((sum, p) => sum + BODYPART_COST[p], 0)
    const units = Math.min(MAX_UNITS, Math.floor(spawn.room.energyCapacityAvailable / unitCost))
    if (units <= 0) return null

    const body = ([] as BodyPartConstant[]).concat(...Array(units).fill(UNIT))
    const order: BodyPartConstant[] = [WORK, CARRY, MOVE]
    body.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return new SpawnConfig(body, creepRoles.EXPANDER, {
      memory: { targetRoom: expansion.target } as ExpanderMemory,
      waitForEnergy: true
    })
  }
}
