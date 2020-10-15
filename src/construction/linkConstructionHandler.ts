import IConstructionHandler from "./IConstructionHandler";
import { findNClosestEmptyPositions, findNClosestEmptyPositionsLattice } from "../utils/latticeSearch";

export default class LinkConstructionHandler implements IConstructionHandler {
  private maxLinksPerRoom = 6;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    let buildableLinksLeft = this.maxLinksPerRoom;
    buildableLinksLeft -= this.markLinksNextToSources(room, desiredState); // 2
    buildableLinksLeft -= this.markLinksNextToMinerals(room, desiredState); // 1
    buildableLinksLeft -= this.markLinksNextToStorage(room, desiredState); // 1

    // mark remaining somewhere // 2

    return desiredState;
  }

  private markLinksNextToStorage(room: Room, desiredState: string[][]): number {
    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        if (desiredState[y][x] !== STRUCTURE_STORAGE) continue;
        const positions: number[][] = findNClosestEmptyPositionsLattice(
          new RoomPosition(x, y, room.name),
          desiredState,
          1
        );

        for (const position of positions) {
          desiredState[position[1]][position[0]] = STRUCTURE_LINK;
        }

        return positions.length;
      }
    }

    return 0;
  }

  private markLinksNextToSources(room: Room, desiredState: string[][]): number {
    const sources: Source[] = room.find(FIND_SOURCES);

    for (const source of sources) {
      this.markPositions(source.pos, desiredState, 1);
    }

    return sources.length;
  }

  private markLinksNextToMinerals(room: Room, desiredState: string[][]): number {
    const minerals: Mineral<MineralConstant>[] = room.find(FIND_MINERALS);

    for (const mineral of minerals) {
      this.markPositions(mineral.pos, desiredState, 1);
    }

    return minerals.length;
  }

  private markPositions(roomPosition: RoomPosition, desiredState: string[][], numPositions: number): string[][] {
    const positions: number[][] = findNClosestEmptyPositionsLattice(roomPosition, desiredState, numPositions);

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_LINK;
    }

    return desiredState;
  }
}
