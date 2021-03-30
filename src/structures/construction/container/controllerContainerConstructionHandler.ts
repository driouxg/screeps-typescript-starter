import { dirs } from "utils/directions";
import { findNClosestEmptyPositionsWithBuffer } from "utils/latticeSearch";
import IConstructionHandler from "../IConstructionHandler";

export default class ControllerContainerConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    if (!room.controller) return desiredState;

    const emptyPositions = findNClosestEmptyPositionsWithBuffer(room.controller.pos, desiredState, 16, 2);
    const nearbyControllerPositions = this.getPositionsNextToController(room);

    for (const emptyPosition of emptyPositions) {
      for (const nearbyControllerPosition of nearbyControllerPositions) {
        if (!nearbyControllerPosition.isNearTo(emptyPosition[0], emptyPosition[1])) continue;
        desiredState[emptyPosition[1]][emptyPosition[0]] = STRUCTURE_CONTAINER;
        return desiredState;
      }
    }

    return desiredState;
  }

  private getPositionsNextToController(room: Room): RoomPosition[] {
    let positions = [];

    const controller = room.controller;

    for (const dir of dirs()) {
      if (room.getTerrain().get(controller!.pos.x + dir[0], controller!.pos.y + dir[1]) === TERRAIN_MASK_WALL) continue;
      positions.push(new RoomPosition(controller!.pos.x + dir[0], controller!.pos.y + dir[1], room.name));
    }

    return positions;
  }
}
