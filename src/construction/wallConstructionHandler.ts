import IConstructionHandler from "./IConstructionHandler";

export default class WallConstructionHandler implements IConstructionHandler {
  public handle(): void {
    for (const roomName in Game.rooms) {
      const room: Room = Game.rooms[roomName];

      const spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);

      for (const spawn of spawns) {
      }
    }
  }
}
