import ContainerConstructionHandler from "construction/containerConstructionHandler";
import ExtensionConstructionHandler from "construction/extensionConstructionHandler";
import ExtractorConstructionHandler from "construction/extractorConstructionHandler";
import FactoryConstructionHandler from "construction/factoryConstructionHandler";
import IConstructionHandler from "construction/IConstructionHandler";
import LabConstructionHandler from "construction/labConstructionHandler";
import LinkConstructionHandler from "construction/linkConstructionHandler";
import NukerConstructionHandler from "construction/nukerConstructionHandler";
import ObserverConstructionHandler from "construction/observerConstructionHandler";
import PowerSpawnConstructionHandler from "construction/powerSpawnConstructionHandler";
import RoadConstructionHandler from "construction/roadConstructionHandler";
import SpawnConstructionHandler from "construction/spawnConstructionHandler";
import StorageConstructionHandler from "construction/storageConstructionHandler";
import TerminalConstructionHandler from "construction/terminalConstructionHandler";
import TowerConstructionHandler from "construction/towerConstructionHandler";
import WallConstructionHandler from "construction/wallConstructionHandler";

export default class ConstructionComposer {
  public constructionHandlers(): IConstructionHandler[] {
    return [
      new RoadConstructionHandler(),
      new WallConstructionHandler(),
      new StorageConstructionHandler(),
      new LinkConstructionHandler(),
      new PowerSpawnConstructionHandler(),
      new NukerConstructionHandler(),
      new SpawnConstructionHandler(),
      new TerminalConstructionHandler(),
      new FactoryConstructionHandler(),
      new TowerConstructionHandler(),
      new ContainerConstructionHandler(),
      new ObserverConstructionHandler(),
      new ExtensionConstructionHandler(),
      new LabConstructionHandler(),
      new ExtractorConstructionHandler()
    ];
  }
}
