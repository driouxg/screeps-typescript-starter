import { buildStringGrid } from "utils/gridBuilder";
import IConstructionHandler from "../IConstructionHandler";
import ILayoutHandler from "../ILayoutHandler";

export default class LatticeLayoutHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[];

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers;
  }

  handle(room: Room): string[][] {
    let desiredState = buildStringGrid();

    for (const constructionHandler of this.constructionHandlers) {
      desiredState = constructionHandler.handle(room, desiredState);
    }

    return desiredState;
  }

  isRoomForLayout(_: Room): boolean {
    return true;
  }
}
