import * as creepRoles from "../creeps/roles";
import generateGuid from "../utils/guidGenerator";

export default class SpawnHandler {
  public handle(): void {
    for (const spawnKey in Game.spawns) {
      if (this.numHarvesters() < 1) {
        console.log(`spawning harvester`);
        Game.spawns[spawnKey].spawnCreep([WORK, WORK, CARRY, MOVE], generateGuid(), {
          memory: { role: creepRoles.HARVESTER, working: false, room: Game.spawns[spawnKey].room.name }
        });
      }
    }
  }

  private numHarvesters() {
    let numHarvesters = 0;
    for (const creepName in Game.creeps) {
      const creep: Creep = Game.creeps[creepName];
      if (creep.memory.role === creepRoles.HARVESTER) {
        numHarvesters++;
      }
    }

    return numHarvesters;
  }
}
