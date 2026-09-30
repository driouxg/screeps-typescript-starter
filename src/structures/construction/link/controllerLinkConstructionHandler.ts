import { dirs } from "utils/directions"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

/**
 * Goal: A link next to the controller container, so upgraders get energy without haulers walking it over.
 *
 * The link goes on a free, buildable tile next to the container, preferring tiles out of the controller's range 1
 * (upgraders stand there).
 */
export default class ControllerLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const controller = room.controller
    if (!controller) return buildOrder

    const container = buildOrder.find(
      s => s.structureType === STRUCTURE_CONTAINER && controller.pos.inRangeTo(s.x, s.y, 2)
    )
    if (!container) return buildOrder

    const terrain = room.getTerrain()
    const desiredState = convert(buildOrder)
    const free = dirs()
      .map(([dx, dy]) => ({ x: container.x + dx, y: container.y + dy }))
      .filter(p => 1 < p.x && p.x < 48 && 1 < p.y && p.y < 48)
      .filter(p => terrain.get(p.x, p.y) !== TERRAIN_MASK_WALL && desiredState[p.y][p.x] === "")
      .filter(p => !(p.x === controller.pos.x && p.y === controller.pos.y))
    free.sort((a, b) => Number(controller.pos.isNearTo(a.x, a.y)) - Number(controller.pos.isNearTo(b.x, b.y)))

    return 0 < free.length ? buildOrder.concat({ ...free[0], structureType: STRUCTURE_LINK }) : buildOrder
  }
}
