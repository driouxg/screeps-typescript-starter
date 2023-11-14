export function dirs(): number[][] {
  return [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [-1, 1],
    [1, -1],
    [1, 0],
    [0, 1],
    [1, 1]
  ]
}

export function isBuildablePos(x: number, y: number): boolean {
  return 2 <= x && x < 48 && 2 <= y && y < 48
}

export function isEdge(x: number, y: number): boolean {
  return !(0 < y && y <= 48 && 0 < x && x <= 48)
}

export function isInBounds(x: number, y: number): boolean {
  return 0 <= y && y < 50 && 0 <= x && x < 50
}

export function isOpenSpot(x: number, y: number, roomName: string, desiredState: string[][]): boolean {
  return !isWall(x, y, roomName) && desiredState[y][x] === "" && isBuildablePos(x, y)
}

export function isWall(x: number, y: number, roomName: string): boolean {
  const room: Room = Game.rooms[roomName]
  return room.getTerrain().get(x, y) === TERRAIN_MASK_WALL
}

export function getAdjacent(pos: RoomPosition) {
  let positions = []
  for (let dir of dirs()) {
    positions.push(new RoomPosition(pos.x + dir[0], pos.y + dir[1], pos.roomName))
  }
  return positions
}

export function myClaimedRoom(room: Room): boolean {
  return room && room.controller !== undefined && room.controller!.my
}
