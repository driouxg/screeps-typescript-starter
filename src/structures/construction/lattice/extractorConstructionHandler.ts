import IConstructionHandler from "../IConstructionHandler"

export default class ExtractorConstructionHandler implements IConstructionHandler {
  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    const minerals: Mineral<MineralConstant>[] = room.find(FIND_MINERALS)

    for (const mineral of minerals) {
      buildOrder = buildOrder.concat({ ...mineral.pos, structureType: STRUCTURE_EXTRACTOR })
    }

    return buildOrder
  }
}
