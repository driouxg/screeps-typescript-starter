import IConstructionHandler from "../IConstructionHandler"
import ILayoutHandler from "../ILayoutHandler"

export default class LatticeLayoutHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[]

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers
  }

  handle(room: Room): BuildOrderStep[] {
    let buildOrder: BuildOrderStep[] = []

    for (const constructionHandler of this.constructionHandlers) {
      buildOrder = constructionHandler.handle(room, buildOrder)
    }

    return buildOrder
  }

  isRoomForLayout(_: Room): boolean {
    return true
  }
}
