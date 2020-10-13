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
