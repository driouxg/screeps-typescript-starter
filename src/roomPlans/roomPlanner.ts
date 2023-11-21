import ExtractorConstructionHandler from "./lattice/extractorConstructionHandler"
import IConstructionHandler from "./IConstructionHandler"
import ConstructionSiteVisualizer from "./utils/ConstructionSiteVisualizer"
import StructurePositionsMemoryUpdater from "./utils/StructurePositionsMemoryUpdater"
import EnergySourceContainerConstructionHandler from "./container/EnergySourceContainerConstructionHandler"
import ControllerContainerConstructionHandler from "./container/ControllerContainerConstructionHandler"
import ILayoutHandler from "./ILayoutHandler"
import SourceLinkConstructionHandler from "./link/SourceLinkConstructionHandler"
import ControllerLinkConstructionHandler from "./link/ControllerLinkConstructionHandler"
import StampLayoutHandler from "./stamp/StampLayoutHandler"
import NoOpLayoutHandler from "./noop/NoOpLayoutHandler"
import build from "./BuildOrderConstructor"

/**
 * Goal: Generate base layouts and cache the results for rooms that I own the controller.
 *
 * https://www.youtube.com/watch?v=YcruUDbqa7E
 */
export default class ConstructionComposer {
  private positionsMemoryUpdater = new StructurePositionsMemoryUpdater()
  private constructionVisualizer = new ConstructionSiteVisualizer()

  public compose(): void {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!room.controller?.my) continue

      // If builderOrder doesn't exist, create one
      if (!room.memory.buildOrder) {
        room.memory.buildOrder = []
        this.cleanupRoomDebris(room)
        const layout = this.firstValidLayout(room)

        room.memory.buildOrder = layout.handle(room)
        this.positionsMemoryUpdater.update(room)
      }

      build(room)

      // this.constructionVisualizer.handle(room, room.memory.buildOrder)
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
      // new BunkerLayoutHandler(this.commonConstructionHandlers()),
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

  private cleanupRoomDebris(room: Room): void {
    room
      .find(FIND_STRUCTURES, {
        filter: c => c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_SPAWN
      })
      .forEach(s => s.destroy())
  }
}
