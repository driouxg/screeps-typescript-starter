import { buildBooleanGrid, isBuildablePos, isOpenSpot } from "./gridBuilder";
import Queue from "./queue";

export function findNClosestEmptyPositions(
  controller: StructureController,
  desiredState: string[][],
  numPositions: number
): number[][] {
  const dirs: number[][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
  ];
  const visited: boolean[][] = buildBooleanGrid();
  const q: Queue<number[]> = new Queue<number[]>();
  q.add([controller.pos.x, controller.pos.y]);

  const positions: number[][] = [];

  while (!q.isEmpty()) {
    const size: number = q.size();

    for (let i = 0; i < size; i++) {
      const pos: number[] | undefined = q.remove();

      if (!pos) continue;

      if (isOpenSpot(pos[0], pos[1], controller.room, desiredState)) positions.push(pos);

      if (numPositions <= positions.length) return positions;

      for (const dir of dirs) {
        const dx: number = pos[0] + dir[0];
        const dy: number = pos[1] + dir[1];

        if (!isBuildablePos(dx, dy) || visited[dx][dy]) continue;

        q.add([dx, dy]);
        visited[dx][dy] = true;
      }
    }
  }

  return positions;
}
