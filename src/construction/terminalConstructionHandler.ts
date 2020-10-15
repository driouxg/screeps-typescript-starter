import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../utils/latticeSearch";

export default class TerminalConstructionHandler implements IConstructionHandler {
  private maxTerminalsPerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      desiredState,
      this.maxTerminalsPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_TERMINAL;
    }

    return desiredState;
  }
}
