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

export function isOpenSpot(x: number, y: number, room: Room): boolean {
  const result: LookAtResult<LookConstant>[] = room.lookAt(x, y);
  return result.length === 1 && result[0].type === "terrain" && result[0].terrain !== "wall";
}
