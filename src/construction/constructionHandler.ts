import IConstructionHandler from "./IConstructionHandler";
import { buildStringGrid } from "utils/gridBuilder";

export default class ContructionHandler {
  private constructionHandlers: IConstructionHandler[];

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers;
  }

  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];
      let desiredState: string[][] = this.getCachedDesiredState(room);

      if (desiredState) {
        this.print(room, desiredState);
        return;
      } else {
        desiredState = buildStringGrid();
      }

      for (const constructionHandler of this.constructionHandlers) {
        desiredState = constructionHandler.handle(room, desiredState);
      }

      this.print(room, desiredState);

      this.updateCachedDesiredState(room, desiredState);
    }
  }

  private print(room: Room, desiredState: string[][]): void {
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
  }

  private getCachedDesiredState(room: Room): string[][] {
    return room.memory.desiredState;
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
