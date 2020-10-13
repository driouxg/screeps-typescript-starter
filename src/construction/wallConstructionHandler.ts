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
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];
      const visual = new RoomVisual(roomName);

      for (let y = 0; y < this.len; y++) {
        for (let x = 0; x < this.len; x++) {
          if (!this.isEdge(x, y) || !this.isPlain(room, x, y) || this.isStructure(room, x, y)) continue;

          this.markWallLocation(visual, room, x, y);
        }
      }
    }
  }

  private isEdge(x: number, y: number): boolean {
    return !(0 < y && y < this.len - 1 && 0 < x && x < this.len - 1);
  }

  private markWallLocation(visual: RoomVisual, room: Room, x: number, y: number): void {
    if (!this.isInBounds(x, y)) return;

    for (const dir of this.dirs) {
      const dx: number = x + dir[0];
      const dy: number = y + dir[1];

      if (!this.isEdge(dx, dy) && this.isInBounds(dx, dy) && !this.isWall(room, dx, dy)) {
        visual.text("w", dx, dy);
      }
    }
  }

  private isInBounds(x: number, y: number) {
    return 0 <= y && y < this.len && 0 <= x && x < this.len;
  }

  private isWall(room: Room, x: number, y: number): boolean {
    return room.getTerrain().get(x, y) === TERRAIN_MASK_WALL;
  }

  private isPlain(room: Room, x: number, y: number) {
    return room.getTerrain().get(x, y) === 0;
  }

  private isStructure(room: Room, x: number, y: number): boolean {
    return room.lookForAt(LOOK_STRUCTURES, x, y).length !== 0;
  }
}
