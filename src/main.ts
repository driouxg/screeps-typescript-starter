import ConstructionHandler from "./construction/constructionHandler";
import CreepHandler from "./creeps/creepHandler";
import { ErrorMapper } from "utils/ErrorMapper";
import SpawnHandler from "./spawns/spawnHandler";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const spawnHandler: SpawnHandler = new SpawnHandler();
  const creepHandler: CreepHandler = new CreepHandler();
  const constructionHandler: ConstructionHandler = new ConstructionHandler();

  spawnHandler.handle();
  creepHandler.handle();
  constructionHandler.handle();

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
});
