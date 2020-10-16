import * as creepRoles from "creeps/roles";
import BuilderSpawnHandler from "spawns/builderSpawnHandler";
import HarvesterSpawnHandler from "spawns/harvesterSpawnHandler";
import HealerSpawnHandler from "spawns/healerSpawnHandler";
import ISpawnHandler from "spawns/ISpawnHandler";
import MeleeDefenderSpawnHandler from "spawns/meleeDefenderSpawnHandler";
import NoOpSpawnHandler from "spawns/noOpSpawnHandler";
import RepairerSpawnHandler from "spawns/repairerSpawnHandler";
import UpgraderSpawnHandler from "spawns/upgraderSpawnHandler";

export default class SpawnComposer {
  public spawner(spawn: StructureSpawn): ISpawnHandler {
    const creepPopulationDict: { [key: string]: number } = this.creepPopulationDict();

    const builderSpawnHandler = this.builderSpawnHandler(creepPopulationDict, this.noOpSpawnHandler());
    const repairerSpawnHandler = this.repairerSpawnHandler(creepPopulationDict, builderSpawnHandler);
    const upgraderSpawnHandler = this.upgraderSpawnHandler(creepPopulationDict, repairerSpawnHandler);
    const harvesterSpawnHandler = this.harvesterSpawnHandler(creepPopulationDict, upgraderSpawnHandler);
    const healerSpawnHandler = this.healerSpawnHandler(creepPopulationDict, harvesterSpawnHandler, spawn);
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

  private harvesterSpawnHandler(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    return new HarvesterSpawnHandler(creepPopulationDict, nextSpawnHandler);
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
