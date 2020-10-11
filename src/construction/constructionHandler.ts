import RoadConstructionHandler from "./roadConstructionHandler";

export default class ContructionHandler {
  private roadConstructionHandler: RoadConstructionHandler;

  public constructor() {
    this.roadConstructionHandler = new RoadConstructionHandler();
  }

  public handle(): void {
    this.roadConstructionHandler.handle();
    // containerConstructionHandler
    // wallConstructionHandler
    // spawnConstructionHandler
  }
}
