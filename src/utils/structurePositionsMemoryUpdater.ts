export default class StructurePositionsMemoryUpdater {
  /**
   * Rebuild room.memory.positions (structure type -> planned positions) from the build order. Starts fresh each time:
   * appending would keep a replanned room's old positions around, sending miners and haulers to stale spots.
   */
  public update(room: Room) {
    room.memory.positions = {}

    room.memory.buildOrder.forEach(step => {
      room.memory.positions[step.structureType] = room.memory.positions[step.structureType] || []
      room.memory.positions[step.structureType].push({ x: step.x, y: step.y, roomName: room.name })
    })
  }
}
