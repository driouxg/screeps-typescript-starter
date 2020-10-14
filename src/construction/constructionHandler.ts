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

      // if (desiredState) {
      // this.print(room, desiredState);
      // return;
      // } else {
      desiredState = buildStringGrid();
      // }

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
        room.visual.text(this.displayText(desiredState[y][x]), x, y);
      }
    }
  }

  private displayText(text: string): string {
    switch (text) {
      case STRUCTURE_TOWER:
        return "T";
      case STRUCTURE_WALL:
        return "W";
      case STRUCTURE_ROAD:
        return "r";
      case STRUCTURE_RAMPART:
        return "R";
      case STRUCTURE_STORAGE:
        return "Stg";
      case STRUCTURE_SPAWN:
        return "Sp";
      case STRUCTURE_POWER_SPAWN:
        return "sPsp";
      case STRUCTURE_CONTAINER:
        return "C";
      case STRUCTURE_EXTENSION:
        return "E";
      default:
        return ".";
    }
  }

  private getCachedDesiredState(room: Room): string[][] {
    return room.memory.desiredState;
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
