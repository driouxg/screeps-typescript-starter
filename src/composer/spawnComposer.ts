import * as creepRoles from "creeps/roles";
import BuilderSpawnHandler from "creeps/spawn/builderSpawnHandler";
import HaulerSpawnHandler from "creeps/spawn/haulerSpawnHandler";
import HealerSpawnHandler from "creeps/spawn/healerSpawnHandler";
import ISpawnHandler from "creeps/spawn/ISpawnHandler";
import MeleeDefenderSpawnHandler from "creeps/spawn/meleeDefenderSpawnHandler";
import MinerSpawnHandler from "creeps/spawn/minerSpawnHandler";
import NoOpSpawnHandler from "creeps/spawn/noOpSpawnHandler";
import PullerSpawnHandler from "creeps/spawn/pullerSpawnHandler";
import RepairerSpawnHandler from "creeps/spawn/repairerSpawnHandler";
import SpawnConfig from "creeps/spawn/SpawnConfig";
import UpgraderSpawnHandler from "creeps/spawn/upgraderSpawnHandler";
import generateGuid from "utils/guidGenerator";

export default class SpawnComposer {
  public compose(): void {
    for (const spawnName in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnName];
      if (spawn.spawning) continue;

      const spawner: ISpawnHandler = this.spawner(spawn);
      const spawnConfig: SpawnConfig = spawner.spawnCreep(spawn.room);
      if (spawnConfig.getBody().length === 0) continue;

      spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
        memory: { role: spawnConfig.getRole(), working: false, room: spawn.room.name }
      });
    }
  }

  public spawner(spawn: StructureSpawn): ISpawnHandler {
    const creepPopulationDict: { [key: string]: number } = this.creepPopulationDict();

    const upgraderSpawnHandler = this.upgraderSpawnHandler(creepPopulationDict, this.noOpSpawnHandler());
    const repairerSpawnHandler = this.repairerSpawnHandler(creepPopulationDict, upgraderSpawnHandler);
    const builderSpawnHandler = this.builderSpawnHandler(creepPopulationDict, repairerSpawnHandler);
    const haulerSpawnHandler = new HaulerSpawnHandler(creepPopulationDict, builderSpawnHandler);
    const minerSpawnHandler = new MinerSpawnHandler(creepPopulationDict, haulerSpawnHandler, spawn);
    const pullerSpawnHandler = new PullerSpawnHandler(creepPopulationDict, minerSpawnHandler);
    const healerSpawnHandler = this.healerSpawnHandler(creepPopulationDict, pullerSpawnHandler, spawn);
    const meleeDefenderSpawnHandler = this.meleeDefenderSpawnHandler(creepPopulationDict, healerSpawnHandler, spawn);
    return meleeDefenderSpawnHandler;
  }

  private creepPopulationDict(): { [key: string]: number } {
    const creepDict: { [key: string]: number } = {};

    for (const creepRole in creepRoles) {
      creepDict[creepRole] = 0;
    }

    for (const creepName in Game.creeps) {
      creepDict[Game.creeps[creepName].memory.role] += 1;
    }

    return creepDict;
  }

  private repairerSpawnHandler(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    return new RepairerSpawnHandler(creepPopulationDict, nextSpawnHandler);
  }

  private upgraderSpawnHandler(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    return new UpgraderSpawnHandler(creepPopulationDict, nextSpawnHandler);
  }

  private builderSpawnHandler(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    return new BuilderSpawnHandler(creepPopulationDict, nextSpawnHandler);
  }

  private healerSpawnHandler(
    creepPopulationDict: { [key: string]: number },
    nextSpawnHandler: ISpawnHandler,
    spawn: StructureSpawn
  ) {
    return new HealerSpawnHandler(creepPopulationDict, nextSpawnHandler, spawn);
  }

  private meleeDefenderSpawnHandler(
    creepPopulationDict: { [key: string]: number },
    nextSpawnHandler: ISpawnHandler,
    spawn: StructureSpawn
  ) {
    return new MeleeDefenderSpawnHandler(creepPopulationDict, nextSpawnHandler, spawn);
  }

  private noOpSpawnHandler(): ISpawnHandler {
    return new NoOpSpawnHandler();
  }
}
