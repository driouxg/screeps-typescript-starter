export type RoomPositionJson = {
    x: number
    y: number
    roomName: string
  }

export function jsonToRoomPosition(pos: RoomPositionJson): RoomPosition {
    if (pos.x === undefined || pos.y === undefined || pos.roomName === undefined)
      throw new Error("Invalid RoomPositionJson: " + JSON.stringify(pos))
    return new RoomPosition(pos.x, pos.y, pos.roomName)
  }
