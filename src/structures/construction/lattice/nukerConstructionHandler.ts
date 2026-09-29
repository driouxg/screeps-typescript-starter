import IConstructionHandler from "../IConstructionHandler"
import { findNClosestEmptyPositionsLattice } from "../../../utils/latticeSearch"
import convert from "../util/buildOrderToDesiredState"

export default class NukerConstructionHandler implements IConstructionHandler {
  private maxNukersPerRoom = 1

  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      convert(buildOrder),
      this.maxNukersPerRoom
    )

    return buildOrder.concat(positions.map(([x, y]) => ({ x, y, structureType: STRUCTURE_NUKER })))
  }
}
