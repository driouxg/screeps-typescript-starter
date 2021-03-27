import IConstructionHandler from "../IConstructionHandler";

export default class RoadExtensionConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const dirs = [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0]
    ];

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] !== STRUCTURE_EXTENSION) continue;

        for (let dir of dirs) {
          if (desiredState[y + dir[1]][x + dir[0]] !== "") continue;
          desiredState[y + dir[1]][x + dir[0]] = STRUCTURE_ROAD;
        }
      }
    }

    return desiredState;
  }
}
