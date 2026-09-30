import ExtractorConstructionHandler from "structures/construction/lattice/extractorConstructionHandler"
import IConstructionHandler from "structures/construction/IConstructionHandler"
import ConstructionSiteVisualizer from "structures/construction/util/constructionSiteVisualizer"
import StructurePositionsMemoryUpdater from "utils/structurePositionsMemoryUpdater"
import EnergySourceContainerConstructionHandler from "structures/construction/container/energySourceContainerConstructionHandler"
import ControllerContainerConstructionHandler from "structures/construction/container/controllerContainerConstructionHandler"
import ILayoutHandler from "structures/construction/ILayoutHandler"
import SourceLinkConstructionHandler from "structures/construction/link/sourceLinkConstructionHandler"
import ControllerLinkConstructionHandler from "structures/construction/link/controllerLinkConstructionHandler"
import StampLayoutHandler from "structures/construction/stamp/StampLayoutHandler"
import NoOpLayoutHandler from "structures/NoOpLayoutHandler"
import build from "structures/construction/buildOrderConstructor"

/**
 * The base layout for a room: the first layout that fits, or none. Also run on its own by the layout test
 * (bench/layout-test.js) against every room of the default map.
 */
export function planLayout(room: Room): BuildOrderStep[] {
  const layout = layoutHandlers().find(l => l.isRoomForLayout(room)) ?? new NoOpLayoutHandler()
  return layout.handle(room)
}

function layoutHandlers(): ILayoutHandler[] {
  return [
    // new BunkerLayoutHandler(commonConstructionHandlers()),
    new StampLayoutHandler(commonConstructionHandlers())
  ]
}

function commonConstructionHandlers(): IConstructionHandler[] {
  return [
    new EnergySourceContainerConstructionHandler(),
    new ControllerContainerConstructionHandler(),
    new SourceLinkConstructionHandler(),
    new ControllerLinkConstructionHandler(),
    new ExtractorConstructionHandler()
  ]
}

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

      build(room)

      // this.constructionVisualizer.handle(room, room.memory.desiredState)
      if (room.memory.buildOrder) continue
      room.memory.buildOrder = []
      this.cleanupRoom(room)

      room.memory.buildOrder = planLayout(room)

      this.positionsMemoryUpdater.update(room)
    }
  }

  private cleanupRoom(room: Room): void {
    room
      .find(FIND_STRUCTURES, {
        filter: c => c.structureType !== STRUCTURE_RAMPART && c.structureType !== STRUCTURE_SPAWN
      })
      .forEach(s => s.destroy())
  }
}
