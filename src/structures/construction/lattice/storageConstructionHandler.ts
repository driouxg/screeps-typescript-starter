import IConstructionHandler from "../IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../../../utils/latticeSearch";

export default class StorageConstructionHandler implements IConstructionHandler {
  private maxStoragePerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      desiredState,
      this.maxStoragePerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_STORAGE;
    }

    return desiredState;
  }
}
