export function buildBooleanGrid(): boolean[][] {
  const grid: boolean[][] = new Array<boolean[]>(50);

  for (let i = 0; i < 50; i++) {
    grid[i] = new Array<boolean>(50);
  }

  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < 50; j++) {
      grid[i][j] = false;
    }
  }

  return grid;
}

export function buildStringGrid(): string[][] {
  const grid: string[][] = new Array<string[]>(50);

  for (let i = 0; i < 50; i++) {
    grid[i] = new Array<string>(50);
  }

  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      grid[i][j] = "";
    }
  }

  return grid;
}

export function isBuildablePos(x: number, y: number): boolean {
  return 2 <= x && x < 48 && 2 <= y && y < 48;
}

export function isEdge(x: number, y: number): boolean {
  return !(0 < y && y <= 48 && 0 < x && x <= 48);
}

export function isInBounds(x: number, y: number): boolean {
  return 0 <= y && y < 50 && 0 <= x && x < 50;
}

export function isOpenSpot(x: number, y: number, roomName: string, desiredState: string[][]): boolean {
  const room: Room = Game.rooms[roomName];
  return room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL && desiredState[y][x] === "" && isBuildablePos(x, y);
}
