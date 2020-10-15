import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../utils/latticeSearch";

export default class TowerConstructionHandler implements IConstructionHandler {
  private maxTowersPerRoom = 6;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      desiredState,
      this.maxTowersPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_TOWER;
    }

    return desiredState;
  }
}
