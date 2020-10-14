import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositions } from "../utils/latticeSearch";

export default class StorageConstructionHandler implements IConstructionHandler {
  private maxStoragePerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositions(room.controller, desiredState, this.maxStoragePerRoom);

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_STORAGE;
    }

    return desiredState;
  }
}
