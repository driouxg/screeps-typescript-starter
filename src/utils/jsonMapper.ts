export function isRoomPositionJson(pos: unknown): pos is RoomPositionJson {
  const p = pos as RoomPositionJson | undefined
  return !!p && typeof p.x === "number" && typeof p.y === "number" && typeof p.roomName === "string"
}

export function jsonToRoomPosition(pos: RoomPositionJson): RoomPosition {
  if (!pos || pos.x === undefined || pos.y === undefined || pos.roomName === undefined)
    throw new Error("Invalid RoomPositionJson: " + JSON.stringify(pos))
  return new RoomPosition(pos.x, pos.y, pos.roomName)
}
