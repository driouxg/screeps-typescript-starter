import ConstructionPosition from "./constructionPosition";
import IConstructionHandler from "./IConstructionHandler";
import { buildStringGrid } from "utils/gridBuilder";
import ConstructionSiteVisualizer from "./util/constructionSiteVisualizer";

export default class ContructionHandler {
  private constructionHandlers: IConstructionHandler[];
  private constructionSiteVisualizer: ConstructionSiteVisualizer;

  public constructor(
    constructionHandlers: IConstructionHandler[],
    constructionSiteVisualizer: ConstructionSiteVisualizer
  ) {
    this.constructionHandlers = constructionHandlers;
    this.constructionSiteVisualizer = constructionSiteVisualizer;
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
      this.updateCachedDesiredState(room, desiredState);
      this.constructionSiteVisualizer.handle(room);
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

  private getCachedDesiredState(room: Room): string[][] {
    return room.memory.desiredState;
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
