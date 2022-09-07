export default class StructurePositionsMemoryUpdater {
  public update(room: Room) {
    room.memory.positions = room.memory.positions ?? {}

    // for (let y = 0; y < desiredState.length; y++) {
    //   for (let x = 0; x < desiredState[y].length; x++) {
    //     if (this.isStructure(desiredState[y][x])) continue

    //     const structure: StructureConstant = desiredState[y][x] as StructureConstant
    //     const pos = new RoomPosition(x, y, room.name)
    //     room.memory.positions[structure] = room.memory.positions[structure]
    //       ? [...room.memory.positions[structure], pos]
    //       : [pos]
    //   }
    // }

    room.memory.buildOrder.forEach(
      step =>
        (room.memory.positions[step.structureType] = room.memory.positions[step.structureType].concat({
          ...step,
          roomName: room.name
        }))
    )
  }

  private isStructure(state: string): boolean {
    return state === ""
  }
}
