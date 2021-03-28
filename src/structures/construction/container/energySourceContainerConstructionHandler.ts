import { findNClosestEmptyPositionsFill } from "utils/latticeSearch";
import IConstructionHandler from "../IConstructionHandler";

export default class EnergySourceContainerConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    const sources = room.find(FIND_SOURCES);

    for (const source of sources) {
      const emptyPositions = findNClosestEmptyPositionsFill(source.pos, desiredState, 1);
      for (const emptyPosition of emptyPositions) {
        desiredState[emptyPosition[1]][emptyPosition[0]] = STRUCTURE_CONTAINER;
      }
    }

    return desiredState;
  }
}
