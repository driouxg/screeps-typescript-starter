import * as creepRoles from "../creeps/roles";
import generateGuid from "../utils/guidGenerator";

export default class SpawnHandler {
  private spawnKey = "";

  public handle(): void {
    for (const spawnKey in Game.spawns) {
      this.spawnKey = spawnKey;
      const creepDict = this.creepDict();

      if (this.getCreepCountByRole(creepRoles.HARVESTER, creepDict) < 4) {
        this.spawnHarvester();
      }
      if (this.getCreepCountByRole(creepRoles.UPGRADER, creepDict) < 3) {
        this.spawnUpgrader();
      }
      if (this.getCreepCountByRole(creepRoles.BUILDER, creepDict) < 2) {
        this.spawnBuilder();
      }
      if (this.getCreepCountByRole(creepRoles.BRAWLER, creepDict) < 2) {
        this.spawnBrawler();
      }
      if (this.getCreepCountByRole(creepRoles.HEALER, creepDict) < 1) {
        this.spawnHealer();
      }

      if (this.getCreepCountByRole(creepRoles.REPAIRER, creepDict) < 1) {
        this.spawnRepairer();
      }
    }
  }

  private spawnHarvester(): void {
    this.spawnCreep([WORK, WORK, CARRY, MOVE], creepRoles.HARVESTER);
  }

  private spawnUpgrader(): void {
    this.spawnCreep([WORK, CARRY, MOVE, MOVE], creepRoles.UPGRADER);
  }

  private spawnBuilder(): void {
    this.spawnCreep([WORK, WORK, CARRY, MOVE], creepRoles.BUILDER);
  }

  private spawnBrawler(): void {
    this.spawnCreep([TOUGH, TOUGH, ATTACK, MOVE], creepRoles.BRAWLER);
  }

  private spawnHealer(): void {
    this.spawnCreep([TOUGH, MOVE, HEAL], creepRoles.HEALER);
  }

  private spawnRepairer(): void {
    this.spawnCreep([WORK, CARRY, MOVE], creepRoles.REPAIRER);
  }

  private spawnCreep(body: BodyPartConstant[], role: string): void {
    Game.spawns[this.spawnKey].spawnCreep(body, generateGuid(), {
      memory: { role, working: false, room: Game.spawns[this.spawnKey].room.name }
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
