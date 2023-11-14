/**
 * Goal: Build structures in a defined order for efficiency.
 */
export default function build(room: Room) {
  if (!room.memory.buildOrder) return
  room.memory.buildCursor = room.memory.buildCursor % room.memory.buildOrder.length || 0

  const { buildCursor } = room.memory

  const buildItem = room.memory.buildOrder[buildCursor]

  if (
    room.lookForAt(LOOK_STRUCTURES, buildItem.x, buildItem.y).some(c => c.structureType === buildItem.structureType)
  ) {
    room.memory.buildCursor += 1
    // console.log(`Structure ${buildItem.structureType} has already been built x: ${buildItem.x}, y: ${buildItem.y}`)
  } else {
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
