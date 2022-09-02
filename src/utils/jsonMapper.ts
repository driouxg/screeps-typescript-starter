export function jsonToRoomPosition(pos: RoomPositionJson): RoomPosition {
  return new RoomPosition(pos.x, pos.y, pos.roomName)
}
