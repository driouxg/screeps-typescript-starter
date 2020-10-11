import IConstructionHandler from "./IConstructionHandler";

export default class RoadConstructionHandler implements IConstructionHandler {
  public handle(): void {
    for (const spawnKey in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnKey];

      if (Game.time < this.getRoadConstructionTick(spawn.room) + 10000) {
        return;
      }

      this.buildRoadToSources(spawn);
      this.buildRoadToController(spawn);

      spawn.room.memory.roadConstructionTick = Game.time;
    }
  }

  private buildRoadToSources(spawn: StructureSpawn): void {
    const sources: Source[] = spawn.room.find(FIND_SOURCES_ACTIVE);

    for (const source of sources) {
      const path: PathStep[] = spawn.pos.findPathTo(source);

      for (const step of path) {
        spawn.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      }
    }
  }

  private buildRoadToController(spawn: StructureSpawn): void {
    const structures: Structure[] = spawn.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTROLLER
    });

    for (const structure of structures) {
      const path: PathStep[] = spawn.pos.findPathTo(structure);

      for (const step of path) {
        spawn.room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      }
    }
  }

  private getRoadConstructionTick(room: Room): number {
    return room.memory.roadConstructionTick || 0;
  }
}
