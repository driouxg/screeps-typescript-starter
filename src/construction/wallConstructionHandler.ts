import { buildStringGrid, isBuildablePos, isEdge, isInBounds, isOpenSpot } from "utils/gridBuilder";
import IConstructionHandler from "./IConstructionHandler";
import Queue from "../utils/queue";

const TAKEN = "X";
const ADDED = "A";
const OPEN = "O";

export default class WallConstructionHandler implements IConstructionHandler {
  private len: number;

  public constructor() {
    this.len = 50;
  }

  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];

      if (this.alreadyCreatedWallsAndRamparts(room)) continue;
      let grid: string[][] = buildStringGrid();
      this.populateGrid(grid, room);

      for (let y = 0; y < this.len; y++) {
        for (let x = 0; x < this.len; x++) {
          if (!isEdge(x, y) || grid[y][x] === TAKEN) continue;
          grid = this.bfs(grid, x, y, room, 2);
        }
      }
      this.updateCache(room);
    }
  }

  private bfs(grid: string[][], x: number, y: number, room: Room, numRamparts: number): string[][] {
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

        if (grid[pos[1]][pos[0]] !== TAKEN && isBuildablePos(pos[0], pos[1])) {
          if (0 < numRamparts) {
            room.createConstructionSite(pos[0], pos[1], STRUCTURE_RAMPART);
            numRamparts--;
          } else {
            room.createConstructionSite(pos[0], pos[1], STRUCTURE_WALL);
          }
          grid[pos[1]][pos[0]] = TAKEN;
          continue;
        }

        grid[pos[1]][pos[0]] = TAKEN;

        for (const dir of dirs) {
          const dx: number = pos[0] + dir[0];
          const dy: number = pos[1] + dir[1];

          if (!isInBounds(dx, dy) || grid[dy][dx] === TAKEN || grid[dy][dx] === ADDED) continue;
          q.add([dx, dy]);
          grid[dy][dx] = ADDED;
        }
      }
    }

    return grid;
  }

  private populateGrid(grid: string[][], room: Room) {
    for (let y = 0; y < this.len; y++) {
      for (let x = 0; x < this.len; x++) {
        grid[y][x] = isOpenSpot(x, y, room) ? OPEN : TAKEN;
      }
    }
  }

  private alreadyCreatedWallsAndRamparts(room: Room): boolean {
    return room.memory.builtWallsAndRamparts || false;
  }

  private updateCache(room: Room) {
    room.memory.builtWallsAndRamparts = true;
  }
}
