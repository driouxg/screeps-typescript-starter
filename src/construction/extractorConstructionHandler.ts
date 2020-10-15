import IConstructionHandler from "./IConstructionHandler";

export default class ExtractorConstructionHandler implements IConstructionHandler {
  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState;

    const minerals: Mineral<MineralConstant>[] = room.find(FIND_MINERALS);

    for (const mineral of minerals) {
      desiredState[mineral.pos.y][mineral.pos.x] = STRUCTURE_EXTRACTOR;
    }

    return desiredState;
  }
}
