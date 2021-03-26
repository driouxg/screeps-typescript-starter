import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../../utils/latticeSearch";

export default class SpawnConstructionHandler implements IConstructionHandler {
  private maxSpawnsPerRoom = 3;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;
    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller.pos,
      desiredState,
      this.maxSpawnsPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_SPAWN;
    }

    desiredState = this.addManuallyCreatedSpawnToDesiredState(room, desiredState);

    return desiredState;
  }

  private addManuallyCreatedSpawnToDesiredState(room: Room, desiredState: string[][]): string[][] {
    const structures = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_SPAWN });

    if (structures.length !== 1) return desiredState;

    const pos = structures[0].pos;
    desiredState[pos.y][pos.x] = STRUCTURE_SPAWN;

    return desiredState;
  }
}
