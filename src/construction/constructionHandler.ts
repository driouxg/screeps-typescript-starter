import { buildStringGrid } from "utils/gridBuilder";
import IConstructionHandler from "./IConstructionHandler";

export default class ContructionHandler {
  private constructionHandlers: IConstructionHandler[];

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers;
  }

  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];
      let desiredState: string[][] = this.getCachedDesiredState(room);

      // if (desiredState) return desiredState;

      for (const constructionHandler of this.constructionHandlers) {
        desiredState = constructionHandler.handle(room, desiredState);
      }

      for (let y = 0; y < desiredState.length; y++) {
        for (let x = 0; x < desiredState[y].length; x++) {
          switch (desiredState[y][x]) {
            case STRUCTURE_TOWER:
              room.visual.text("T", x, y);
              break;
            case STRUCTURE_WALL:
              room.visual.text("W", x, y);
              break;
            case STRUCTURE_ROAD:
              room.visual.text("r", x, y);
              break;
            case STRUCTURE_RAMPART:
              room.visual.text("R", x, y);
              break;
            default:
              room.visual.text(".", x, y);
              break;
          }
        }
      }

      this.updateCachedDesiredState(room, desiredState);
    }
  }

  private getCachedDesiredState(room: Room): string[][] {
    return room.memory.desiredState || buildStringGrid();
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
