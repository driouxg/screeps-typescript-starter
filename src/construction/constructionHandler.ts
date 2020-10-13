import RoadConstructionHandler from "./roadConstructionHandler";
import TowerConstructionHandler from "./towerConstructionHandler";
import WallConstructionHandler from "./wallConstructionHandler";

export default class ContructionHandler {
  private roadConstructionHandler: RoadConstructionHandler;
  private wallConstructionHandler: WallConstructionHandler;
  private towerConstructionHandler: TowerConstructionHandler;

  public constructor() {
    this.roadConstructionHandler = new RoadConstructionHandler();
    this.wallConstructionHandler = new WallConstructionHandler();
    this.towerConstructionHandler = new TowerConstructionHandler();
  }

  public handle(): void {
    this.roadConstructionHandler.handle();
    this.wallConstructionHandler.handle();
    this.towerConstructionHandler.handle();
    // containerConstructionHandler
    // wallConstructionHandler
    // spawnConstructionHandler
  }
}
