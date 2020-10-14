import ConstructionHandler from "./construction/constructionHandler";
import CreepHandler from "./creeps/creepHandler";
import { ErrorMapper } from "utils/ErrorMapper";
import IConstructionHandler from "construction/IConstructionHandler";
import RoadConstructionHandler from "construction/roadConstructionHandler";
import SpawnHandler from "./spawns/spawnHandler";
import StorageConstructionHandler from "construction/storageConstructionHandler";
import TowerConstructionHandler from "construction/towerConstructionHandler";
import WallConstructionHandler from "construction/wallConstructionHandler";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const spawnHandler: SpawnHandler = new SpawnHandler();
  const creepHandler: CreepHandler = new CreepHandler();
  const constructionHandler: ConstructionHandler = new ConstructionHandler(constructionHandlers());

  spawnHandler.handle();
  creepHandler.handle();
  constructionHandler.handle();

  deleteMissingCreepMemory();
});

function constructionHandlers(): IConstructionHandler[] {
  // containerConstructionHandler
  // spawnConstructionHandler
  return [
    new WallConstructionHandler(),
    new RoadConstructionHandler(),
    new StorageConstructionHandler(),
    new TowerConstructionHandler()
  ];
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}
