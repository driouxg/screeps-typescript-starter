import { spawn } from "child_process";
import * as creepRoles from "../creeps/roles";
import generateGuid from "../utils/guidGenerator";

export default class SpawnHandler {
  public handle(): void {
    for (const spawnKey in Game.spawns) {
      const creepDict = this.creepDict();

      if (this.getCreepCountByRole(creepRoles.HARVESTER, creepDict) < 1) {
        this.spawnHarvester(spawnKey);
      }
      if (this.getCreepCountByRole(creepRoles.UPGRADER, creepDict) < 1) {
        this.spawnUpgrader(spawnKey);
      }
      if (this.getCreepCountByRole(creepRoles.BUILDER, creepDict) < 1) {
        this.spawnBuilder(spawnKey);
      }
      if (this.getCreepCountByRole(creepRoles.BRAWLER, creepDict) < 2) {
        this.spawnBrawler(spawnKey);
      }
    }
  }

  private spawnHarvester(spawnKey: string): void {
    this.spawnCreep(spawnKey, [WORK, WORK, CARRY, MOVE], creepRoles.HARVESTER);
  }

  private spawnUpgrader(spawnKey: string): void {
    this.spawnCreep(spawnKey, [WORK, CARRY, MOVE, MOVE], creepRoles.UPGRADER);
  }

  private spawnBuilder(spawnKey: string): void {
    this.spawnCreep(spawnKey, [WORK, WORK, CARRY, MOVE], creepRoles.BUILDER);
  }

  private spawnBrawler(spawnKey: string): void {
    this.spawnCreep(spawnKey, [TOUGH, TOUGH, ATTACK, MOVE], creepRoles.BRAWLER);
  }

  private spawnCreep(spawnKey: string, body: BodyPartConstant[], role: string): void {
    Game.spawns[spawnKey].spawnCreep(body, generateGuid(), {
      memory: { role, working: false, room: Game.spawns[spawnKey].room.name }
    });
  }

  private creepDict(): { [key: string]: number } {
    const creepDict: { [key: string]: number } = {};

    for (const creepName in Game.creeps) {
      const creep: Creep = Game.creeps[creepName];
      creepDict[creep.memory.role] = (creepDict[creep.memory.role] || 0) + 1;
    }

    return creepDict;
  }

  private getCreepCountByRole(role: string, creeps: { [key: string]: number }): number {
    return creeps[role] ? creeps[role] : 0;
  }
}
