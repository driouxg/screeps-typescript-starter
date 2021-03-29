import { isBuildablePos } from "utils/gridBuilder";
import { findNClosestEmptyPositionsWithBuffer } from "utils/latticeSearch";
import IConstructionHandler from "../IConstructionHandler";

export default class InitialSpawnConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    const spawns = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_SPAWN });

    if (spawns.length === 1) {
      const spawn = spawns[0];
      desiredState[spawn.pos.y][spawn.pos.x] = STRUCTURE_SPAWN;
    } else {
      const sources = room.find(FIND_SOURCES);

      const positions = findNClosestEmptyPositionsWithBuffer(sources[0].pos, desiredState, 10, 5);

      for (let pos of positions) {
        if (!isBuildablePos(pos[0], pos[1])) continue;
        desiredState[pos[1]][pos[0]] = STRUCTURE_SPAWN;
        break;
      }
    }

    return desiredState;
  }
}
