import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../../utils/latticeSearch";

export default class ObserverConstructionHandler implements IConstructionHandler {
  private maxObserversPerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      desiredState,
      this.maxObserversPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_OBSERVER;
    }

    return desiredState;
  }
}
