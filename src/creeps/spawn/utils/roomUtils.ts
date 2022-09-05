export function isRoomRemoteMineable(roomName?: string) {
  if (!roomName) return false

  const room = Game.rooms[roomName]
  if (!room) return false
  if (room.controller !== undefined && room.controller?.safeMode !== undefined) return false // Room is in safe mode
  // should still remote mine if claimed unless spawn is in room
  if (["claimedMy", "claimedEnemy", "unseen", "hostile", "unclaimable"].includes(room.memory.status)) return false

  return true
}

export function getUnorderedExits(room: Room) {
  const exits = Game.map.describeExits(room.name)
  const roomNames = Object.keys(exits).map(direction => exits[direction as ExitKey])

  return roomNames.sort(() => Math.random() - 0.5)
}

export function getOrderedExits(room: Room) {
  const exits = Game.map.describeExits(room.name)
  return Object.keys(exits).map(direction => exits[direction as ExitKey])
}
