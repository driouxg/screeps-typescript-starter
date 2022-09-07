import { dirs } from "utils/directions"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

export default class SourceLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const containerPositions = this.containerPositions(room, convert(buildOrder))

    const sources: Source[] = room.find(FIND_SOURCES)

    for (const source of sources) {
      for (const containerPos of containerPositions) {
        if (!containerPos.isNearTo(source.pos.x, source.pos.y)) continue

        for (const dir of dirs()) {
          const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], room.name)

          if (pos.isEqualTo(source.pos.x, source.pos.y) || room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL)
            continue
          buildOrder = buildOrder.concat({ ...pos, structureType: STRUCTURE_LINK })
          break
        }
      }
    }

    return buildOrder
  }

  private containerPositions(room: Room, desiredState: string[][]): RoomPosition[] {
    let positions = []

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] === STRUCTURE_CONTAINER) positions.push(new RoomPosition(x, y, room.name))
      }
    }

    return positions
  }
}
