import { dirs } from "utils/directions";
import { findCachedContainerPositions } from "utils/structureUtils";
import IConstructionHandler from "../IConstructionHandler";

export default class SourceLinkConstructionHandler implements IConstructionHandler {
  handle(room: Room, desiredState: string[][]): string[][] {
    const containerPositions = findCachedContainerPositions(room);

    const sources: Source[] = room.find(FIND_SOURCES);

    for (const source of sources) {
      for (const containerPos of containerPositions) {
        if (!containerPos.isNearTo(source.pos.x, source.pos.y)) continue;

        for (const dir of dirs()) {
          const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], room.name);
          console.log(`hi`);
          if (pos.isEqualTo(source.pos.x, source.pos.y) || room.getTerrain().get(pos.x, pos.y) === TERRAIN_MASK_WALL)
            continue;
          desiredState[pos.y][pos.x] = STRUCTURE_LINK;
        }
      }
    }

    return desiredState;
  }
}
