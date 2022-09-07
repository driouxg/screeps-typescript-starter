export default class StructurePositionsMemoryUpdater {
  public update(room: Room) {
    room.memory.positions = room.memory.positions ?? {}

    room.memory.buildOrder.forEach(step => {
      room.memory.positions[step.structureType] = room.memory.positions[step.structureType] || []
      room.memory.positions[step.structureType] = room.memory.positions[step.structureType].concat({
        ...step,
        roomName: room.name
      })
    })
  }

  private isStructure(state: string): boolean {
    return state === ""
  }
}
