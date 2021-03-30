import ContainerConstructionHandler from "structures/construction/lattice/containerConstructionHandler";
import ExtensionConstructionHandler from "structures/construction/lattice/extensionConstructionHandler";
import ExtractorConstructionHandler from "structures/construction/lattice/extractorConstructionHandler";
import FactoryConstructionHandler from "structures/construction/lattice/factoryConstructionHandler";
import IConstructionHandler from "structures/construction/IConstructionHandler";
import LabConstructionHandler from "structures/construction/lattice/labConstructionHandler";
import LinkConstructionHandler from "structures/construction/lattice/linkConstructionHandler";
import NukerConstructionHandler from "structures/construction/lattice/nukerConstructionHandler";
import ObserverConstructionHandler from "structures/construction/lattice/observerConstructionHandler";
import PowerSpawnConstructionHandler from "structures/construction/lattice/powerSpawnConstructionHandler";
import RoadConstructionHandler from "structures/construction/road/roadConstructionHandler";
import SpawnConstructionHandler from "structures/construction/lattice/spawnConstructionHandler";
import StorageConstructionHandler from "structures/construction/lattice/storageConstructionHandler";
import TerminalConstructionHandler from "structures/construction/lattice/terminalConstructionHandler";
import TowerConstructionHandler from "structures/construction/lattice/towerConstructionHandler";
import ConstructionSiteVisualizer from "structures/construction/util/constructionSiteVisualizer";
import WallConstructionHandler from "structures/construction/lattice/wallConstructionHandler";
import settings from "settings";
import DesiredStateConstructor from "structures/construction/desiredStateConstructor";
import StructurePositionsMemoryUpdater from "utils/structurePositionsMemoryUpdater";
import RoadExtensionConstructionHandler from "structures/construction/road/roadExtensionConstructionHandler";
import InitialSpawnConstructionHandler from "structures/construction/lattice/initialSpawnConstructionHandler";
import EnergySourceContainerConstructionHandler from "structures/construction/container/energySourceContainerConstructionHandler";
import ControllerContainerConstructionHandler from "structures/construction/container/controllerContainerConstructionHandler";
import LatticeLayoutHandler from "structures/construction/lattice/latticeLayoutHandler";
import ILayoutHandler from "structures/construction/ILayoutHandler";
import BunkerConstructionHandler from "structures/construction/bunker/bunkerLayoutHandler";
import SourceLinkConstructionHandler from "structures/construction/lattice/sourceLinkConstructionHandler";

export default class ConstructionComposer {
  private positionsMemoryUpdater = new StructurePositionsMemoryUpdater();
  private constructionVisualizer = new ConstructionSiteVisualizer(settings);
  private desiredStateConstructor = new DesiredStateConstructor();

  public compose(): void {
    for (const roomName in Game.rooms) this.go(Game.rooms[roomName]);
  }

  private go(room: Room): void {
    this.desiredStateConstructor.construct(room, room.memory.desiredState);
    this.constructionVisualizer.handle(room);

    if (room.memory.desiredState) return;

    const layout = this.getValidLayout(room);

    room.memory.desiredState = layout.handle(room);

    this.positionsMemoryUpdater.update(room);
  }

  private getValidLayout(room: Room): ILayoutHandler {
    for (const layout of this.layoutHandlers()) {
      if (layout.isRoomForLayout(room)) return layout;
    }

    return this.latticeLayoutHandler();
  }

  private layoutHandlers(): ILayoutHandler[] {
    return [new BunkerConstructionHandler(this.bunkerConstructionHandlers()), this.latticeLayoutHandler()];
  }

  private latticeLayoutHandler(): ILayoutHandler {
    return new LatticeLayoutHandler(this.latticeConstructionHandlers());
  }

  private bunkerConstructionHandlers(): IConstructionHandler[] {
    return [
      new InitialSpawnConstructionHandler(),
      new EnergySourceContainerConstructionHandler(),
      new ControllerContainerConstructionHandler(),
      new SourceLinkConstructionHandler()
    ];
  }

  private latticeConstructionHandlers(): IConstructionHandler[] {
    return [
      new InitialSpawnConstructionHandler(),
      new EnergySourceContainerConstructionHandler(),
      new ControllerContainerConstructionHandler(),
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
      new RoadExtensionConstructionHandler(),
      new LabConstructionHandler(),
      new ExtractorConstructionHandler(),
      new SourceLinkConstructionHandler()
    ];
  }
}
