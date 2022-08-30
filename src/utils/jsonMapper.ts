export function jsonToRoomPosition(pos: { x: number; y: number; roomName: string }): RoomPosition {
  return new RoomPosition(pos.x, pos.y, pos.roomName)
}
