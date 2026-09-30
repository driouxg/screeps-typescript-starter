import { dirs } from "utils/directions"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

/**
 * Goal: A link next to each source's container, so the miner there can feed it without a hauler.
 *
 * The link goes on a free, buildable tile next to the container, preferring tiles not next to the source: those are
 * where miners stand.
 */
export default class SourceLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const terrain = room.getTerrain()

    for (const source of room.find(FIND_SOURCES)) {
      const desiredState = convert(buildOrder)
      const container = buildOrder.find(s => s.structureType === STRUCTURE_CONTAINER && source.pos.isNearTo(s.x, s.y))
      if (!container) continue

      const free = dirs()
        .map(([dx, dy]) => ({ x: container.x + dx, y: container.y + dy }))
        .filter(p => 1 < p.x && p.x < 48 && 1 < p.y && p.y < 48)
        .filter(p => terrain.get(p.x, p.y) !== TERRAIN_MASK_WALL && desiredState[p.y][p.x] === "")
        .filter(p => !(p.x === source.pos.x && p.y === source.pos.y))
      free.sort((a, b) => Number(source.pos.isNearTo(a.x, a.y)) - Number(source.pos.isNearTo(b.x, b.y)))

      if (0 < free.length) buildOrder = buildOrder.concat({ ...free[0], structureType: STRUCTURE_LINK })
    }

    return buildOrder
  }
}
