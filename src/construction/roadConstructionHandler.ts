import IConstructionHandler from "./IConstructionHandler";

export default class RoadConstructionHandler implements IConstructionHandler {
  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const controller: StructureController = room.controller;

    this.buildRoadToSources(controller, desiredState);
    this.buildRoadToRamparts(controller, desiredState);
    // build road to all ramparts, since we'll have 1 rampart per side

    return desiredState;
  }

  private buildRoadToSources(controller: StructureController, desiredState: string[][]): void {
    const sources: Source[] = controller.room.find(FIND_SOURCES);

    for (const source of sources) {
      const path: PathStep[] = controller.pos.findPathTo(source);

      for (const step of path) {
        desiredState[step.y][step.x] = STRUCTURE_ROAD;
      }
    }
  }

  private buildRoadToRamparts(controller: StructureController, desiredState: string[][]): void {
    const rampartPositions: number[][] = [];

    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        if (desiredState[y][x] === STRUCTURE_RAMPART) {
          rampartPositions.push([x, y]);
        }
      }
    }

    for (const rampartPosition of rampartPositions) {
      const path: PathStep[] = controller.pos.findPathTo(rampartPosition[0], rampartPosition[1]);

      for (const step of path) {
        if (desiredState[step.y][step.x] !== "") continue;

        desiredState[step.y][step.x] = STRUCTURE_ROAD;
      }
    }
  }
}
