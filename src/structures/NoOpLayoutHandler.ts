import { buildStringGrid } from "utils/gridBuilder"
import ILayoutHandler from "./construction/ILayoutHandler"

export default class NoOpLayoutHandler implements ILayoutHandler {
  handle(room: Room): string[][] {
    console.log("Unable to build in room", room.name)
    return buildStringGrid()
  }
  isRoomForLayout(room: Room): boolean {
    return false
  }
}
