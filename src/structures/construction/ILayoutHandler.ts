export default interface ILayoutHandler {
  handle(room: Room): string[][];
  isRoomForLayout(room: Room): boolean;
}
