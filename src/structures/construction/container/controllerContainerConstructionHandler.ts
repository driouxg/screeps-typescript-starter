import { findNClosestEmptyPositionsFill } from "utils/latticeSearch";
import IConstructionHandler from "../IConstructionHandler";

export default class ControllerContainerConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    if (!room.controller) return desiredState;

    const emptyPositions = findNClosestEmptyPositionsFill(room.controller.pos, desiredState, 1);
    for (const emptyPosition of emptyPositions) {
      desiredState[emptyPosition[1]][emptyPosition[0]] = STRUCTURE_CONTAINER;
    }

    return desiredState;
  }
}
