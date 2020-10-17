import ConstructionPosition from "./constructionPosition";
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

      if (!desiredState) {
        desiredState = buildStringGrid();

        for (const constructionHandler of this.constructionHandlers) {
          desiredState = constructionHandler.handle(room, desiredState);
        }
      }

      this.buildToAchieveDesiredState(room, desiredState);
      // this.print(room, desiredState);

      this.updateCachedDesiredState(room, desiredState);
    }
  }

  private buildToAchieveDesiredState(room: Room, desiredState: string[][]): void {
    const constructionPos: ConstructionPosition = new ConstructionPosition(room.memory.constructionPos);

    const desiredSitesConstructedPerTick = 10;
    let sitesReviewed = 0;

    while (sitesReviewed < desiredSitesConstructedPerTick) {
      const y: number = constructionPos.getY();
      let idx = constructionPos.getX();

      while (idx < 50 && sitesReviewed < desiredSitesConstructedPerTick) {
        const x: number = constructionPos.getX();
        if (desiredState[y][x] !== "") {
          room.createConstructionSite(x, y, this.mapStringToStructureConstant(desiredState[y][x]));
          sitesReviewed++;
        }
        idx++;
        constructionPos.incrementX();
      }

      constructionPos.incrementY();
    }
    room.memory.constructionPos = constructionPos.serialize();
  }

  private print(room: Room, desiredState: string[][]): void {
    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        room.visual.text(this.displayText(desiredState[y][x]), x, y);
      }
    }
  }

  private mapStringToStructureConstant(text: string): BuildableStructureConstant {
    switch (text) {
      case STRUCTURE_TOWER:
        return STRUCTURE_TOWER;
      case STRUCTURE_WALL:
        return STRUCTURE_WALL;
      case STRUCTURE_ROAD:
        return STRUCTURE_ROAD;
      case STRUCTURE_RAMPART:
        return STRUCTURE_RAMPART;
      case STRUCTURE_STORAGE:
        return STRUCTURE_STORAGE;
      case STRUCTURE_SPAWN:
        return STRUCTURE_SPAWN;
      case STRUCTURE_POWER_SPAWN:
        return STRUCTURE_POWER_SPAWN;
      case STRUCTURE_CONTAINER:
        return STRUCTURE_CONTAINER;
      case STRUCTURE_EXTENSION:
        return STRUCTURE_EXTENSION;
      case STRUCTURE_NUKER:
        return STRUCTURE_NUKER;
      case STRUCTURE_OBSERVER:
        return STRUCTURE_OBSERVER;
      case STRUCTURE_LAB:
        return STRUCTURE_LAB;
      case STRUCTURE_LINK:
        return STRUCTURE_LINK;
      case STRUCTURE_TERMINAL:
        return STRUCTURE_TERMINAL;
      case STRUCTURE_FACTORY:
        return STRUCTURE_FACTORY;
      case STRUCTURE_EXTRACTOR:
        return STRUCTURE_EXTRACTOR;
      default:
        return STRUCTURE_NUKER;
    }
  }

  private displayText(text: string): string {
    switch (text) {
      case STRUCTURE_TOWER:
        return "To";
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
      case STRUCTURE_NUKER:
        return "N";
      case STRUCTURE_OBSERVER:
        return "O";
      case STRUCTURE_LAB:
        return "La";
      case STRUCTURE_LINK:
        return "Li";
      case STRUCTURE_TERMINAL:
        return "Ter";
      case STRUCTURE_FACTORY:
        return "F";
      case STRUCTURE_EXTRACTOR:
        return "Ex";
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
