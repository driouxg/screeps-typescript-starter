import * as creepRoles from "creeps/roles";
import BuilderSpawnHandler from "creeps/spawn/builderSpawnHandler";
import HarvesterSpawnHandler from "creeps/spawn/harvesterSpawnHandler";
import HealerSpawnHandler from "creeps/spawn/healerSpawnHandler";
import ISpawnHandler from "creeps/spawn/ISpawnHandler";
import MeleeDefenderSpawnHandler from "creeps/spawn/meleeDefenderSpawnHandler";
import NoOpSpawnHandler from "creeps/spawn/noOpSpawnHandler";
import RepairerSpawnHandler from "creeps/spawn/repairerSpawnHandler";
import UpgraderSpawnHandler from "creeps/spawn/upgraderSpawnHandler";

export default class SpawnComposer {
  public spawner(spawn: StructureSpawn): ISpawnHandler {
    const creepPopulationDict: { [key: string]: number } = this.creepPopulationDict();

    const repairerSpawnHandler = this.repairerSpawnHandler(creepPopulationDict, this.noOpSpawnHandler());
    const builderSpawnHandler = this.builderSpawnHandler(creepPopulationDict, repairerSpawnHandler);
    const upgraderSpawnHandler = this.upgraderSpawnHandler(creepPopulationDict, builderSpawnHandler);
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
