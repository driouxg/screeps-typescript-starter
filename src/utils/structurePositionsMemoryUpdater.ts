export default class StructurePositionsMemoryUpdater {
  public update(room: Room) {
    const desiredState = room.memory.desiredState;

    room.memory.positions = {};

    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        if (this.isStructure(desiredState[y][x])) continue;

        const structure: StructureConstant = desiredState[y][x] as StructureConstant;
        room.memory.positions[structure] = room.memory.positions[structure]
          ? [...room.memory.positions[structure], { x, y }]
          : [{ x, y }];
      }
    }
  }

  private isStructure(state: string): boolean {
    return state === "";
  }
}
