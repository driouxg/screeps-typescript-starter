import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsFill } from "../../utils/latticeSearch";

export default class ContainerConstructionHandler implements IConstructionHandler {
  private maxContainersPerRoom = 5;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const buildableContainers =
      this.maxContainersPerRoom - this.retrieveNumberOfExistingContainerPositions(desiredState);

    const positions: number[][] = findNClosestEmptyPositionsFill(
      room.controller.pos,
      desiredState,
      buildableContainers
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_CONTAINER;
    }

    return desiredState;
  }

  private retrieveNumberOfExistingContainerPositions(desiredState: string[][]): number {
    let containers = 0;

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] === STRUCTURE_CONTAINER) containers++;
      }
    }

    return containers;
  }
}
