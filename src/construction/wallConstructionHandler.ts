import { isBuildablePos, isEdge, isInBounds } from "utils/gridBuilder";
import IConstructionHandler from "./IConstructionHandler";

export default class WallConstructionHandler implements IConstructionHandler {
  private len: number;
  private dirs: number[][];

  public constructor() {
    this.len = 50;
    this.dirs = [
      [-2, -2],
      [-2, 0],
      [-2, 2],
      [0, -2],
      [0, 2],
      [2, -2],
      [2, 0],
      [2, 2]
    ];
  }

  public handle(): void {
    // for every open edge, bfs and mark walls

    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];

      for (let y = 0; y < this.len; y++) {
        for (let x = 0; x < this.len; x++) {
          if (!isEdge(x, y) || !this.isOpenSpot(x, y, room)) continue;

          this.markWallLocation(room, x, y);
        }
      }
    }
  }

  private markWallLocation(room: Room, x: number, y: number): void {
    if (!isInBounds(x, y)) return;

    for (const dir of this.dirs) {
      const dx: number = x + dir[0];
      const dy: number = y + dir[1];

      if (!isEdge(dx, dy) && isInBounds(dx, dy) && !this.isWall(room, dx, dy)) {
        room.visual.text("W", dx, dy);
      }
    }
  }

  private isWall(room: Room, x: number, y: number): boolean {
    return room.getTerrain().get(x, y) === TERRAIN_MASK_WALL;
  }

  private isOpenSpot(x: number, y: number, room: Room): boolean {
    const result: LookAtResult<LookConstant>[] = room.lookAt(x, y);
    return result.length === 1 && result[0].type === "terrain" && result[0].terrain !== "wall";
  }

  private isStructure(room: Room, x: number, y: number): boolean {
    return room.lookForAt(LOOK_STRUCTURES, x, y).length !== 0;
  }
}
