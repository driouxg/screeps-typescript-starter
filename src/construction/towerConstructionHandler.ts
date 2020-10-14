import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositions } from "../utils/latticeSearch";

export default class TowerConstructionHandler implements IConstructionHandler {
  private maxTowersPerRoom = 6;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositions(room.controller, desiredState, this.maxTowersPerRoom);

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_TOWER;
    }

    return desiredState;
  }
}
