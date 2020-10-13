import IConstructionHandler from "./IConstructionHandler";
import Queue from "utils/queue";
import { spawn } from "child_process";

export default class TowerConstructionHandler implements IConstructionHandler {
  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];
      if (!this.isMyController(room.controller)) continue;
      if (!room.controller) continue;

      const myNumberOfTowers: number = this.findMyNumberOfTowers(room);
      const desiredNumberOfTowers = 2;
      if (desiredNumberOfTowers < myNumberOfTowers) return;

      const positions: RoomPosition[] = this.findNClosestEmptyPositions(
        room.controller,
        desiredNumberOfTowers - myNumberOfTowers
      );

      for (const position of positions) {
        room.visual.text("T", position.x, position.y);
      }
    }
  }

  private isMyController(controller: StructureController | undefined): boolean {
    return controller ? controller.my : false;
  }

  private findNClosestEmptyPositions(controller: StructureController, numPositions: number): RoomPosition[] {
    const dirs: number[][] = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ];
    const visited: boolean[][] = this.buildVisitedTable();
    const q: Queue<number[]> = new Queue<number[]>();
    q.add([controller.pos.x, controller.pos.y]);

    const positions: RoomPosition[] = [];

    while (!q.isEmpty()) {
      const size: number = q.size();

      for (let i = 0; i < size; i++) {
        const pos: number[] | undefined = q.remove();

        if (!pos) continue;

        const x = pos[0];
        const y = pos[1];

        if (this.isOpenSpot(x, y, controller.room)) {
          positions.push(new RoomPosition(x, y, controller.room.name));
        }

        if (numPositions <= positions.length) return positions;

        for (const dir of dirs) {
          const dx: number = x + dir[0];
          const dy: number = y + dir[1];

          if (!this.isInBounds(dx, dy) || visited[dx][dy]) continue;

          q.add([dx, dy]);
          visited[dx][dy] = true;
        }
      }
    }

    return positions;
  }

  private isOpenSpot(x: number, y: number, room: Room): boolean {
    const result: LookAtResult<LookConstant>[] = room.lookAt(x, y);
    return result.length === 1 && result[0].type === "terrain" && result[0].terrain !== "wall";
  }

  private isInBounds(x: number, y: number): boolean {
    return 2 <= x && x < 48 && 2 <= y && y < 48;
  }

  private buildVisitedTable(): boolean[][] {
    const visited: boolean[][] = new Array<boolean[]>(50);

    for (let i = 0; i < 50; i++) {
      visited[i] = new Array<boolean>(50);
    }

    for (let i = 0; i < 50; i++) {
      for (let j = 0; j < 50; j++) {
        visited[i][j] = false;
      }
    }

    return visited;
  }

  private findMyNumberOfTowers(room: Room): number {
    const myTowers: AnyOwnedStructure[] = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    });
    const myTowerConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    });

    return myTowers.length + myTowerConstructionSites.length;
  }
}
