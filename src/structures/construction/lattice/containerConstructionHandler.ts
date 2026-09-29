import IConstructionHandler from "../IConstructionHandler"
import { findNClosestEmptyPositionsFill } from "../../../utils/latticeSearch"
import convert from "../util/buildOrderToDesiredState"

export default class ContainerConstructionHandler implements IConstructionHandler {
  private maxContainersPerRoom = 5

  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    const existingContainers = buildOrder.filter(step => step.structureType === STRUCTURE_CONTAINER).length
    const buildableContainers = this.maxContainersPerRoom - existingContainers

    const positions: number[][] = findNClosestEmptyPositionsFill(
      room.controller.pos,
      convert(buildOrder),
      buildableContainers
    )

    return buildOrder.concat(positions.map(([x, y]) => ({ x, y, structureType: STRUCTURE_CONTAINER })))
  }
}
