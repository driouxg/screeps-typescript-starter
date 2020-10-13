import IConstructionHandler from "./IConstructionHandler";
import Queue from "utils/queue";

export default class TowerConstructionHandler implements IConstructionHandler {
  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];
      if (!this.isMyController(room.controller)) continue;
      if (!room.controller) continue;

      const myNumberOfTowers: number = this.findMyNumberOfTowers(room);
      const maxTowers = this.getMaxTowersForControllerLevel(room.controller);
      if (maxTowers <= myNumberOfTowers) return;

      const positions: number[][] = this.findNClosestEmptyPositions(room.controller, maxTowers - myNumberOfTowers);

      for (const position of positions) {
        room.createConstructionSite(position[0], position[1], STRUCTURE_TOWER);
      }
    }
  }

  private isMyController(controller: StructureController | undefined): boolean {
    return controller ? controller.my : false;
  }

  private findNClosestEmptyPositions(controller: StructureController, numPositions: number): number[][] {
    const dirs: number[][] = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ];
    const visited: boolean[][] = this.buildVisitedTable();
    const q: Queue<number[]> = new Queue<number[]>();
    q.add([controller.pos.x, controller.pos.y]);

    const positions: number[][] = [];

    while (!q.isEmpty()) {
      const size: number = q.size();

      for (let i = 0; i < size; i++) {
        const pos: number[] | undefined = q.remove();

        if (!pos) continue;

        if (this.isOpenSpot(pos[0], pos[1], controller.room)) positions.push(pos);

        if (numPositions <= positions.length) return positions;

        for (const dir of dirs) {
          const dx: number = pos[0] + dir[0];
          const dy: number = pos[1] + dir[1];

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

  private getMaxTowersForControllerLevel(controller: StructureController): number {
    const towerCapacityMax: { [key: number]: number } = {
      0: 0,
      1: 0,
      2: 0,
      3: 1,
      4: 1,
      5: 2,
      6: 2,
      7: 3,
      8: 6
    };

    return towerCapacityMax[controller.level];
  }
}
