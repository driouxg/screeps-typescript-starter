import IConstructionHandler from "./IConstructionHandler";

export default class RoadConstructionHandler implements IConstructionHandler {
  public handle(): void {
    for (const spawnKey in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnKey];
      this.buildPathToSources(spawn);
      // build path to controller
    }
  }

  private buildPathToSources(spawn: StructureSpawn): void {
    const sources: Source[] = spawn.room.find(FIND_SOURCES_ACTIVE);

    for (const source of sources) {
      const path: PathStep[] = spawn.pos.findPathTo(source);

      for (const step of path) {
        spawn.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      }
    }
  }
}
