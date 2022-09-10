import IConstructionHandler from "../IConstructionHandler"

export default class ExtractorConstructionHandler implements IConstructionHandler {
  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!(room.controller && room.controller.my)) return buildOrder

    room.find(FIND_MINERALS).forEach(mineral => {
      buildOrder = buildOrder.concat({ x: mineral.pos.x, y: mineral.pos.y, structureType: STRUCTURE_EXTRACTOR })
    })

    return buildOrder
  }
}
