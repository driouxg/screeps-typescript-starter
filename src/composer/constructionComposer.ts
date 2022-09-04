import ContainerConstructionHandler from "structures/construction/lattice/containerConstructionHandler"
import ExtensionConstructionHandler from "structures/construction/lattice/extensionConstructionHandler"
import ExtractorConstructionHandler from "structures/construction/lattice/extractorConstructionHandler"
import FactoryConstructionHandler from "structures/construction/lattice/factoryConstructionHandler"
import IConstructionHandler from "structures/construction/IConstructionHandler"
import LabConstructionHandler from "structures/construction/lattice/labConstructionHandler"
import LinkConstructionHandler from "structures/construction/lattice/linkConstructionHandler"
import NukerConstructionHandler from "structures/construction/lattice/nukerConstructionHandler"
import ObserverConstructionHandler from "structures/construction/lattice/observerConstructionHandler"
import PowerSpawnConstructionHandler from "structures/construction/lattice/powerSpawnConstructionHandler"
import RoadConstructionHandler from "structures/construction/road/roadConstructionHandler"
import SpawnConstructionHandler from "structures/construction/lattice/spawnConstructionHandler"
import StorageConstructionHandler from "structures/construction/lattice/storageConstructionHandler"
import TerminalConstructionHandler from "structures/construction/lattice/terminalConstructionHandler"
import TowerConstructionHandler from "structures/construction/lattice/towerConstructionHandler"
import ConstructionSiteVisualizer from "structures/construction/util/constructionSiteVisualizer"
import WallConstructionHandler from "structures/construction/lattice/wallConstructionHandler"
import settings from "settings"
import DesiredStateConstructor from "structures/construction/desiredStateConstructor"
import StructurePositionsMemoryUpdater from "utils/structurePositionsMemoryUpdater"
import RoadExtensionConstructionHandler from "structures/construction/road/roadExtensionConstructionHandler"
import InitialSpawnConstructionHandler from "structures/construction/lattice/initialSpawnConstructionHandler"
import EnergySourceContainerConstructionHandler from "structures/construction/container/energySourceContainerConstructionHandler"
import ControllerContainerConstructionHandler from "structures/construction/container/controllerContainerConstructionHandler"
import LatticeLayoutHandler from "structures/construction/lattice/latticeLayoutHandler"
import ILayoutHandler from "structures/construction/ILayoutHandler"
import BunkerLayoutHandler from "structures/construction/bunker/bunkerLayoutHandler"
import SourceLinkConstructionHandler from "structures/construction/link/sourceLinkConstructionHandler"
import ControllerLinkConstructionHandler from "structures/construction/link/controllerLinkConstructionHandler"
import StampLayoutHandler from "structures/construction/stamp/StampLayoutHandler"
import NoOpLayoutHandler from "structures/NoOpLayoutHandler"

/**
 * Goal: Generate base layouts and cache the results for rooms that I own the controller.
 *
 * https://www.youtube.com/watch?v=YcruUDbqa7E
 *
 *
 *
 */
export default class ConstructionComposer {
  private positionsMemoryUpdater = new StructurePositionsMemoryUpdater()
  private constructionVisualizer = new ConstructionSiteVisualizer()
  private desiredStateConstructor = new DesiredStateConstructor()

  public compose(): void {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!room.controller?.my) continue

      this.desiredStateConstructor.construct(room, room.memory.desiredState)

      // this.constructionVisualizer.handle(room, room.memory.desiredState)
      // if (room.memory.desiredState) continue

      this.cleanupRoom(room)
      const layout = this.firstValidLayout(room)

      this.constructionVisualizer.handle(room, layout.handle(room))

      room.memory.desiredState = layout.handle(room)

      this.positionsMemoryUpdater.update(room)
    }
  }

  private firstValidLayout(room: Room): ILayoutHandler {
    for (const layout of this.layoutHandlers()) {
      if (layout.isRoomForLayout(room)) return layout
    }

    return new NoOpLayoutHandler()
  }

  private layoutHandlers(): ILayoutHandler[] {
    return [
      new BunkerLayoutHandler(this.commonConstructionHandlers()),
      new StampLayoutHandler(this.commonConstructionHandlers())
    ]
  }

  private commonConstructionHandlers(): IConstructionHandler[] {
    return [
      new EnergySourceContainerConstructionHandler(),
      new ControllerContainerConstructionHandler(),
      new SourceLinkConstructionHandler(),
      new ControllerLinkConstructionHandler(),
      new ExtractorConstructionHandler()
    ]
  }

  private cleanupRoom(room: Room): void {
    room
      .find(FIND_STRUCTURES, {
        filter: c => c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_SPAWN
      })
      .forEach(s => s.destroy())
  }
}
