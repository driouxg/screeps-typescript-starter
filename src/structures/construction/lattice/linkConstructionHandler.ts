import { findNClosestEmptyPositionsLattice, findNClosestEmptyPositionsWithBuffer } from "../../../utils/latticeSearch";
import IConstructionHandler from "../IConstructionHandler";

export default class LinkConstructionHandler implements IConstructionHandler {
  private maxLinksPerRoom = 6;

  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    this.markLinksNextToMinerals(room, desiredState); // uses 2 links
    this.markLinksNextToStorage(room, desiredState); // uses 1 link

    return desiredState;
  }

  private markLinksNextToStorage(room: Room, desiredState: string[][]): number {
    const desiredLinks = 1;
    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        if (desiredState[y][x] !== STRUCTURE_STORAGE) continue;
        const positions: number[][] = findNClosestEmptyPositionsLattice(
          new RoomPosition(x, y, room.name),
          desiredState,
          desiredLinks
        );

        for (const position of positions) {
          desiredState[position[1]][position[0]] = STRUCTURE_LINK;
        }

        return positions.length;
      }
    }

    return 0;
  }

  private markLinksNextToMinerals(room: Room, desiredState: string[][]): number {
    const desiredLinks = 2;
    const minerals: Mineral<MineralConstant>[] = room.find(FIND_MINERALS);

    for (const mineral of minerals) {
      this.markPositions(mineral.pos, desiredState, desiredLinks);
    }

    return minerals.length;
  }

  private markPositions(roomPosition: RoomPosition, desiredState: string[][], numPositions: number): string[][] {
    const positions: number[][] = findNClosestEmptyPositionsWithBuffer(roomPosition, desiredState, numPositions, 2);

    for (const position of positions) {
      desiredState[position[1]][position[0]] = STRUCTURE_LINK;
    }

    return desiredState;
  }
}
