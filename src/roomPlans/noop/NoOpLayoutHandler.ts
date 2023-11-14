import ILayoutHandler from "../ILayoutHandler"

export default class NoOpLayoutHandler implements ILayoutHandler {
  handle(room: Room): BuildOrderStep[] {
    console.log("Unable to build in room", room.name)
    return []
  }
  isRoomForLayout(room: Room): boolean {
    return false
  }
}
