import { dirs } from "../utils/Directions"
import { findNClosestEmptyPositionsWithBuffer } from "../utils/LatticeSearch"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../utils/BuildOrderToDesiredState"

export default class ControllerContainerConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!room.controller) return buildOrder

    const emptyPositions = findNClosestEmptyPositionsWithBuffer(room.controller.pos, convert(buildOrder), 16, 2)
    const nearbyControllerPositions = this.getPositionsNextToController(room)

    for (const emptyPosition of emptyPositions) {
      for (const nearbyControllerPosition of nearbyControllerPositions) {
        if (!nearbyControllerPosition.isNearTo(emptyPosition[0], emptyPosition[1])) continue
        buildOrder = buildOrder.concat({ x: emptyPosition[0], y: emptyPosition[1], structureType: STRUCTURE_CONTAINER })
        return buildOrder
      }
    }

    return buildOrder
  }

  private getPositionsNextToController(room: Room): RoomPosition[] {
    let positions = []

    const controller = room.controller

    for (const dir of dirs()) {
      if (room.getTerrain().get(controller!.pos.x + dir[0], controller!.pos.y + dir[1]) === TERRAIN_MASK_WALL) continue
      positions.push(new RoomPosition(controller!.pos.x + dir[0], controller!.pos.y + dir[1], room.name))
    }

    return positions
  }
}
