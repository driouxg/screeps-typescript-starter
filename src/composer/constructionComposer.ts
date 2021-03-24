import ContainerConstructionHandler from "structures/construction/containerConstructionHandler";
import ExtensionConstructionHandler from "structures/construction/extensionConstructionHandler";
import ExtractorConstructionHandler from "structures/construction/extractorConstructionHandler";
import FactoryConstructionHandler from "structures/construction/factoryConstructionHandler";
import IConstructionHandler from "structures/construction/IConstructionHandler";
import LabConstructionHandler from "structures/construction/labConstructionHandler";
import LinkConstructionHandler from "structures/construction/linkConstructionHandler";
import NukerConstructionHandler from "structures/construction/nukerConstructionHandler";
import ObserverConstructionHandler from "structures/construction/observerConstructionHandler";
import PowerSpawnConstructionHandler from "structures/construction/powerSpawnConstructionHandler";
import RoadConstructionHandler from "structures/construction/roadConstructionHandler";
import SpawnConstructionHandler from "structures/construction/spawnConstructionHandler";
import StorageConstructionHandler from "structures/construction/storageConstructionHandler";
import TerminalConstructionHandler from "structures/construction/terminalConstructionHandler";
import TowerConstructionHandler from "structures/construction/towerConstructionHandler";
import WallConstructionHandler from "structures/construction/wallConstructionHandler";

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
