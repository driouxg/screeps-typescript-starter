import { dirs } from "utils/directions";
import IConstructionHandler from "../IConstructionHandler";

export default class ControllerLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    if (!room.controller) return desiredState;

    const containerPos = this.findContainerNearController(room, desiredState);

    if (!containerPos) return desiredState;

    for (const dir of dirs()) {
      const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], room.name);
      if (pos.isNearTo(room.controller!.pos.x, room.controller!.pos.y)) continue;
      desiredState[pos.y][pos.x] = STRUCTURE_LINK;
      return desiredState;
    }

    return desiredState;
  }

  private findContainerNearController(room: Room, desiredState: string[][]): RoomPosition | null {
    const containerPositions = this.containerPositions(room, desiredState);

    for (const pos of containerPositions) {
      if (room.controller!.pos.inRangeTo(pos.x, pos.y, 2)) return pos;
    }

    return null;
  }

  private containerPositions(room: Room, desiredState: string[][]): RoomPosition[] {
    let positions = [];

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] === STRUCTURE_CONTAINER) positions.push(new RoomPosition(x, y, room.name));
      }
    }

    return positions;
  }
}
