import { buildBooleanGrid, isBuildablePos, isOpenSpot, isWall } from "./gridBuilder";
import Queue from "./queue";

export function findNClosestEmptyPositionsWithBuffer(
  pos: RoomPosition,
  desiredState: string[][],
  numPositions: number
): number[][] {
  const dirs: number[][] = [
    [-2, -2],
    [-2, 2],
    [-2, 0],
    [0, -2],
    [0, 2],
    [2, 0],
    [2, -2],
    [2, 2]
  ];

  return findNClosestEmptyPositions(pos, desiredState, numPositions, dirs);
}

export function findNClosestEmptyPositionsLattice(
  pos: RoomPosition,
  desiredState: string[][],
  numPositions: number
): number[][] {
  const dirs: number[][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ];
  return findNClosestEmptyPositions(pos, desiredState, numPositions, dirs);
}

export function findNClosestEmptyPositionsFill(
  pos: RoomPosition,
  desiredState: string[][],
  numPositions: number
): number[][] {
  const dirs: number[][] = [
    [-1, -1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, 0],
    [1, -1],
    [1, 1]
  ];
  return findNClosestEmptyPositions(pos, desiredState, numPositions, dirs);
}

export function findNClosestEmptyPositions(
  roomPosition: RoomPosition,
  desiredState: string[][],
  numPositions: number,
  dirs: number[][]
): number[][] {
  const visited: boolean[][] = buildBooleanGrid();
  const q: Queue<number[]> = new Queue<number[]>();
  q.add([roomPosition.x, roomPosition.y]);

  const positions: number[][] = [];

  while (!q.isEmpty()) {
    const size: number = q.size();

    for (let i = 0; i < size; i++) {
      const pos: number[] | undefined = q.remove();

      if (!pos) continue;

      if (isOpenSpot(pos[0], pos[1], roomPosition.roomName, desiredState)) positions.push(pos);

      if (numPositions <= positions.length) return positions;

      for (const dir of dirs) {
        const dx: number = pos[0] + dir[0];
        const dy: number = pos[1] + dir[1];

        if (!isBuildablePos(dx, dy) || isWall(dx, dy, roomPosition.roomName) || visited[dx][dy]) continue;

        q.add([dx, dy]);
        visited[dx][dy] = true;
      }
    }
  }

  return positions;
}
