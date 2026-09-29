import { isBuildablePos } from "utils/gridBuilder"
import { findNClosestEmptyPositionsWithBuffer } from "utils/latticeSearch"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

export default class InitialSpawnConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const spawns = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_SPAWN })

    if (spawns.length === 1) {
      const spawn = spawns[0]
      return buildOrder.concat({ x: spawn.pos.x, y: spawn.pos.y, structureType: STRUCTURE_SPAWN })
    }

    const sources = room.find(FIND_SOURCES)
    if (sources.length <= 0) return buildOrder

    const positions = findNClosestEmptyPositionsWithBuffer(sources[0].pos, convert(buildOrder), 10, 5)

    for (let pos of positions) {
      if (!isBuildablePos(pos[0], pos[1])) continue
      return buildOrder.concat({ x: pos[0], y: pos[1], structureType: STRUCTURE_SPAWN })
    }

    return buildOrder
  }
}
