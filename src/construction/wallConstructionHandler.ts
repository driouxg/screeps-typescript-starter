import { buildBooleanGrid, isEdge, isInBounds, isOpenSpot } from "utils/gridBuilder";
import IConstructionHandler from "./IConstructionHandler";
import Queue from "../utils/queue";

export default class WallConstructionHandler implements IConstructionHandler {
  public handle(room: Room, desiredState: string[][]): string[][] {
    const visited: boolean[][] = buildBooleanGrid();

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (!isEdge(x, y) || room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue;
        desiredState = this.bfs(desiredState, visited, x, y, room);
      }
    }

    return desiredState;
  }

  private bfs(desiredState: string[][], visited: boolean[][], x: number, y: number, room: Room): string[][] {
    let numRamparts = 2;
    const dirs: number[][] = [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, 1],
      [1, -1],
      [1, 0]
    ];
    const q: Queue<number[]> = new Queue<number[]>();
    q.add([x, y]);

    while (!q.isEmpty()) {
      const size: number = q.size();
      for (let i = 0; i < size; i++) {
        const pos: number[] | undefined = q.remove();

        if (!pos) continue;

        if (isOpenSpot(pos[0], pos[1], room, desiredState)) {
          if (0 < numRamparts) {
            desiredState[pos[1]][pos[0]] = STRUCTURE_RAMPART;
            numRamparts--;
          } else {
            desiredState[pos[1]][pos[0]] = STRUCTURE_WALL;
          }
          continue;
        }

        visited[pos[1]][pos[0]] = true;

        for (const dir of dirs) {
          const dx: number = pos[0] + dir[0];
          const dy: number = pos[1] + dir[1];

          if (!isInBounds(dx, dy) || visited[dy][dx] || room.getTerrain().get(dx, dy) === TERRAIN_MASK_WALL) continue;
          q.add([dx, dy]);
          visited[dy][dx] = true;
        }
      }
    }

    return desiredState;
  }
}
