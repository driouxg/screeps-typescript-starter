import { findNClosestEmptyPositionsFill } from "utils/latticeSearch"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

export default class EnergySourceContainerConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const sources = room.find(FIND_SOURCES)

    for (const source of sources) {
      let desiredState = convert(buildOrder)
      const emptyPositions = findNClosestEmptyPositionsFill(source.pos, desiredState, 1)
      for (const emptyPosition of emptyPositions) {
        desiredState[emptyPosition[1]][emptyPosition[0]] = STRUCTURE_CONTAINER
        buildOrder = buildOrder.concat({ x: emptyPosition[0], y: emptyPosition[1], structureType: STRUCTURE_CONTAINER })
      }
    }

    return buildOrder
  }
}
