import { isBuildablePos, isInBounds, isWall } from "utils/gridBuilder";
import IConstructionHandler from "../IConstructionHandler";

export default class RoadConstructionHandler implements IConstructionHandler {
  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const controller: StructureController = room.controller;

    this.buildRoadsBetweenControllerAndSources(controller, desiredState);
    this.buildRoadsBetweenControllAndExits(controller, desiredState);
    // build road to minerals
    this.buildRoadsBetweenControllerAndSpawns(controller, desiredState);
    this.buildRoadsBetweenSourcesAndSpawns(controller, desiredState);

    return desiredState;
  }

  private buildRoadsBetweenControllerAndSources(controller: StructureController, desiredState: string[][]): void {
    const sources: Source[] = controller.room.find(FIND_SOURCES);

    this.markRoadsBetweenPositions(
      [controller.pos],
      sources.map(s => s.pos),
      desiredState
    );
  }

  private buildRoadsBetweenControllerAndSpawns(controller: StructureController, desiredState: string[][]): void {
    const spawns = this.spawnPositions(controller, desiredState);

    this.markRoadsBetweenPositions([controller.pos], spawns, desiredState);
  }

  private spawnPositions(controller: StructureController, desiredState: string[][]): RoomPosition[] {
    const spawns = [];

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] === STRUCTURE_SPAWN) spawns.push(new RoomPosition(x, y, controller.room.name));
      }
    }
    return spawns;
  }

  private buildRoadsBetweenSourcesAndSpawns(controller: StructureController, desiredState: string[][]): void {
    const spawnPositions = this.spawnPositions(controller, desiredState);

    this.markRoadsBetweenPositions(
      controller.room.find(FIND_SOURCES).map(s => s.pos),
      spawnPositions,
      desiredState
    );
  }

  private markRoadsBetweenPositions(from: RoomPosition[], to: RoomPosition[], desiredState: string[][]): void {
    for (const fromPos of from) {
      for (const toPos of to) {
        const path: PathStep[] = fromPos.findPathTo(toPos);

        for (let i = 0; i < path.length - 1; i++) {
          const step = path[i];
          if (desiredState[step.y][step.x] === STRUCTURE_ROAD) break;
          if (isBuildablePos(step.x, step.y)) desiredState[step.y][step.x] = STRUCTURE_ROAD;
        }
      }
    }
  }

  private buildRoadsBetweenControllAndExits(controller: StructureController, desiredState: string[][]): void {
    const exits: number[][] = [];

    const leftExit = this.findExit(controller, desiredState, "LEFT");
    if (leftExit) exits.push([leftExit[0], leftExit[1]]);

    const topExit = this.findExit(controller, desiredState, "TOP");
    if (topExit) exits.push([topExit[0], topExit[1]]);

    const rightExit = this.findExit(controller, desiredState, "RIGHT");
    if (rightExit) exits.push([rightExit[0], rightExit[1]]);

    const bottomExit = this.findExit(controller, desiredState, "BOTTOM");
    if (bottomExit) exits.push([bottomExit[0], bottomExit[1]]);

    for (const exit of exits) {
      const path: PathStep[] = controller.pos.findPathTo(exit[0], exit[1]);

      for (const step of path) {
        if (!isBuildablePos(step.x, step.y)) continue;

        desiredState[step.y][step.x] = STRUCTURE_ROAD;
      }
    }
  }

  private findExit(controller: StructureController, desiredState: string[][], exit: string): number[] | undefined {
    const positions: { [key: string]: { [key: string]: number } } = {
      TOP: { x: 0, y: 0 },
      LEFT: { x: 0, y: 0 },
      RIGHT: { x: 49, y: 0 },
      BOTTOM: { x: 0, y: 49 }
    };
    let x = positions[exit].x;
    let y = positions[exit].y;
    const horizontal: boolean = exit === "TOP" || exit === "BOTTOM";
    while (y < desiredState.length && x < desiredState[y].length && isWall(x, y, controller.room.name)) {
      if (horizontal) x++;
      else y++;
    }

    if (!isWall(x, y, controller.room.name) && isInBounds(x, y)) return [x, y];
    else return undefined;
  }
}
