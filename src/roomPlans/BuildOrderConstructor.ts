/**
 * Goal: Build structures in a defined order for efficiency.
 */
export default function build(room: Room) {
  if (!room.memory.buildOrder) return
  room.memory.buildCursor = room.memory.buildCursor % room.memory.buildOrder.length || 0

  const { buildCursor } = room.memory

  if (Game.time % 1000 === 0) resetBuildCursorForSelfHealing(room)

  const buildItem = room.memory.buildOrder[buildCursor]

  if (!buildItem) console.log(`ERROR: build order is corrupted at step ${buildCursor} for room ${room.name}`)

  if (buildingAlreadyExists(room, buildItem)) room.memory.buildCursor += 1
  else {
    const buildCode = room.createConstructionSite(buildItem.x, buildItem.y, buildItem.structureType)

    if (buildCode === ERR_RCL_NOT_ENOUGH) room.memory.buildCursor += 1
    else if (buildCode === ERR_INVALID_TARGET) return
    // This is returned as well if construction site already exists there.
    else if (buildCode === OK) return
    else {
      console.log(`Failed to build ${buildItem.structureType} at x: ${buildItem.x}, y: ${buildItem.y}`)
      room.memory.buildCursor += 1
    }
  }
}

function buildingAlreadyExists(room: Room, buildItem: BuildOrderStep) {
  return room
    .lookForAt(LOOK_STRUCTURES, buildItem.x, buildItem.y)
    .some(c => c.structureType === buildItem.structureType)
}

function resetBuildCursorForSelfHealing(room: Room) {
  room.memory.buildCursor = 0
}
