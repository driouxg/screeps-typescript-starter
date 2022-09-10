import * as creepRoles from "../roles"

import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

export default class RapidFillerSpawnHandler implements ISpawnHandler {
  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const {
      room,
      pos: { x, y }
    } = spawn

    if (room.memory.buildOrder === undefined && room.memory.buildCursor === undefined) return null

    if (room.memory.buildCursor < room.memory.buildOrder.length) return null

    const spawnType = getRapidFillerSpawnType(spawn)

    if (spawnType === LEFT) {
      const creeps = room.lookForAt(LOOK_CREEPS, x + 1, y)
      if (creeps.length === 0) return spawnConfig([RIGHT])
    } else if (spawnType === RIGHT) {
      const creeps = room.lookForAt(LOOK_CREEPS, x - 1, y)
      if (creeps.length === 0) return spawnConfig([LEFT])
    } else if (spawnType === BOTTOM) {
      const creeps1 = room.lookForAt(LOOK_CREEPS, x - 1, y - 1)
      if (creeps1.length === 0) return spawnConfig([TOP_LEFT])

      const creeps2 = room.lookForAt(LOOK_CREEPS, x + 1, y - 1)
      if (creeps2.length === 0) return spawnConfig([TOP_RIGHT])
    }

    return null
  }
}

function spawnConfig(directions: DirectionConstant[]) {
  return new SpawnConfig([CARRY], creepRoles.RAPID_FILLER, { directions })
}

export function getRapidFillerSpawnType(spawn: StructureSpawn): LEFT | RIGHT | BOTTOM {
  const { x, y } = spawn.pos

  const l = spawn.room.lookForAt(LOOK_STRUCTURES, x - 1, y)
  if (l.length === 1 && l[0].structureType === STRUCTURE_ROAD) return LEFT

  const r = spawn.room.lookForAt(LOOK_STRUCTURES, x + 1, y)
  if (r.length === 1 && r[0].structureType === STRUCTURE_ROAD) return RIGHT

  return BOTTOM
}
