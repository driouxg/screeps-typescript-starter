import IConstructionHandler from "./IConstructionHandler";
import { buildStringGrid } from "utils/gridBuilder";
import ConstructionSiteVisualizer from "./util/constructionSiteVisualizer";
import DesiredStateConstructor from "./desiredStateConstructor";
import StructurePositionsMemoryUpdater from "utils/structurePositionsMemoryUpdater";

export default class ContructionHandler {
  private constructionHandlers: IConstructionHandler[];
  private constructionSiteVisualizer: ConstructionSiteVisualizer;
  private desiredStateConstructor: DesiredStateConstructor;
  private structurePositionsMemoryUpdater: StructurePositionsMemoryUpdater;

  public constructor(
    constructionHandlers: IConstructionHandler[],
    constructionSiteVisualizer: ConstructionSiteVisualizer,
    desiredStateConstructor: DesiredStateConstructor,
    structurePositionsMemoryUpdater: StructurePositionsMemoryUpdater
  ) {
    this.constructionHandlers = constructionHandlers;
    this.constructionSiteVisualizer = constructionSiteVisualizer;
    this.desiredStateConstructor = desiredStateConstructor;
    this.structurePositionsMemoryUpdater = structurePositionsMemoryUpdater;
  }

  public handle(): void {
    for (const roomName in Game.rooms) this.construct(Game.rooms[roomName]);
  }

  private construct(room: Room): void {
    let desiredState: string[][] = room.memory.desiredState;

    if (desiredState) return;

    desiredState = buildStringGrid();

    for (const constructionHandler of this.constructionHandlers) {
      desiredState = constructionHandler.handle(room, desiredState);
    }

    this.updateCachedDesiredState(room, desiredState);
    this.structurePositionsMemoryUpdater.update(room);

    this.desiredStateConstructor.construct(room, desiredState);
    this.constructionSiteVisualizer.handle(room);
  }

  private updateCachedDesiredState(room: Room, desiredState: string[][]): void {
    room.memory.desiredState = desiredState;
  }
}
