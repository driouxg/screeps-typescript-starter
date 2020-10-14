import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositionsLattice } from "../utils/latticeSearch";

export default class PowerSpawnConstructionHandler implements IConstructionHandler {
  private maxPowerSpawnsPerRoom = 1;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const positions: number[][] = findNClosestEmptyPositionsLattice(
      room.controller,
      desiredState,
      this.maxPowerSpawnsPerRoom
    );

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_POWER_SPAWN;
    }

    return desiredState;
  }
}
