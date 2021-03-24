import IConstructionHandler from "./IConstructionHandler";
import { buildStringGrid } from "utils/gridBuilder";
import ConstructionSiteVisualizer from "./util/constructionSiteVisualizer";
import DesiredStateConstructor from "./desiredStateConstructor";

export default class ContructionHandler {
  private constructionHandlers: IConstructionHandler[];
  private constructionSiteVisualizer: ConstructionSiteVisualizer;
  private desiredStateConstructor: DesiredStateConstructor;

  public constructor(
    constructionHandlers: IConstructionHandler[],
    constructionSiteVisualizer: ConstructionSiteVisualizer,
    desiredStateConstructor: DesiredStateConstructor
  ) {
    this.constructionHandlers = constructionHandlers;
    this.constructionSiteVisualizer = constructionSiteVisualizer;
    this.desiredStateConstructor = desiredStateConstructor;
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

      this.desiredStateConstructor.construct(room, desiredState);
      this.updateCachedDesiredState(room, desiredState);
      this.constructionSiteVisualizer.handle(room);
    }
  }

  private getCachedDesiredState(room: Room): string[][] {
    return room.memory.desiredState;
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
