import { findNClosestEmptyPositionsLattice, findNClosestEmptyPositionsWithBuffer } from "../../../utils/latticeSearch"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

export default class LinkConstructionHandler implements IConstructionHandler {
  private maxLinksPerRoom = 6

  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    buildOrder = this.markLinksNextToMinerals(room, buildOrder) // uses 2 links
    buildOrder = this.markLinksNextToStorage(room, buildOrder) // uses 1 link

    return buildOrder
  }

  private markLinksNextToStorage(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const desiredLinks = 1
    const storage = buildOrder.find(step => step.structureType === STRUCTURE_STORAGE)
    if (!storage) return buildOrder

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      new RoomPosition(storage.x, storage.y, room.name),
      convert(buildOrder),
      desiredLinks
    )

    return buildOrder.concat(this.toLinkSteps(positions))
  }

  private markLinksNextToMinerals(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const desiredLinks = 2
    const minerals: Mineral<MineralConstant>[] = room.find(FIND_MINERALS)

    for (const mineral of minerals) {
      const positions: number[][] = findNClosestEmptyPositionsWithBuffer(
        mineral.pos,
        convert(buildOrder),
        desiredLinks,
        2
      )
      buildOrder = buildOrder.concat(this.toLinkSteps(positions))
    }

    return buildOrder
  }

  private toLinkSteps(positions: number[][]): BuildOrderStep[] {
    return positions.map(([x, y]) => ({ x, y, structureType: STRUCTURE_LINK }))
  }
}
