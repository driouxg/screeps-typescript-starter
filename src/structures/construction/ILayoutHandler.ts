export default interface ILayoutHandler {
  handle(room: Room): BuildOrderStep[]
  isRoomForLayout(room: Room): boolean
}
