import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsFill } from "../utils/latticeSearch";

export default class ContainerConstructionHandler implements IConstructionHandler {
  private maxContainersPerRoom = 5;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsFill(
      room.controller.pos,
      desiredState,
      this.maxContainersPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_CONTAINER;
    }

    return desiredState;
  }
}
