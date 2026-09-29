import IConstructionHandler from "../IConstructionHandler"
import { findNClosestEmptyPositionsLattice } from "../../../utils/latticeSearch"
import convert from "../util/buildOrderToDesiredState"

export default class PowerSpawnConstructionHandler implements IConstructionHandler {
  private maxPowerSpawnsPerRoom = 1

  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      convert(buildOrder),
      this.maxPowerSpawnsPerRoom
    )

    return buildOrder.concat(positions.map(([x, y]) => ({ x, y, structureType: STRUCTURE_POWER_SPAWN })))
  }
}
