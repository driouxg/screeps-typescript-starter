import { dirs } from "utils/directions"
import IConstructionHandler from "../IConstructionHandler"
import convert from "../util/buildOrderToDesiredState"

export default class ControllerLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    if (!room.controller) return buildOrder

    let desiredState = convert(buildOrder)
    const containerPos = this.findContainerNearController(room, desiredState)

    if (!containerPos) return buildOrder

    for (const dir of dirs()) {
      const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], room.name)
      if (pos.isNearTo(room.controller!.pos.x, room.controller!.pos.y)) continue
      return buildOrder.concat({ x: pos.x, y: pos.y, structureType: STRUCTURE_LINK })
    }

    return buildOrder
  }

  private findContainerNearController(room: Room, desiredState: string[][]): RoomPosition | null {
    const containerPositions = this.containerPositions(room, desiredState)

    for (const pos of containerPositions) {
      if (room.controller!.pos.inRangeTo(pos.x, pos.y, 2)) return pos
    }

    return null
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
