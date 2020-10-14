import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../utils/latticeSearch";

export default class NukerConstructionHandler implements IConstructionHandler {
  private maxNukersPerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller,
      desiredState,
      this.maxNukersPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_NUKER;
    }

    return desiredState;
  }
}
