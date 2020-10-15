import ConstructionHandler from "./construction/constructionHandler";
import ContainerConstructionHandler from "construction/containerConstructionHandler";
import CreepHandler from "./creeps/creepHandler";
import { ErrorMapper } from "utils/ErrorMapper";
import ExtensionConstructionHandler from "construction/extensionConstructionHandler";
import ExtractorConstructionHandler from "construction/extractorConstructionHandler";
import IConstructionHandler from "construction/IConstructionHandler";
import LabConstructionHandler from "construction/labConstructionHandler";
import NukerConstructionHandler from "construction/nukerConstructionHandler";
import ObserverConstructionHandler from "construction/observerConstructionHandler";
import PowerSpawnConstructionHandler from "construction/powerSpawnConstructionHandler";
import RoadConstructionHandler from "construction/roadConstructionHandler";
import SpawnConstructionHandler from "construction/spawnConstructionHandler";
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
  return [
    new WallConstructionHandler(),
    new RoadConstructionHandler(),
    new StorageConstructionHandler(),
    new PowerSpawnConstructionHandler(),
    new NukerConstructionHandler(),
    new SpawnConstructionHandler(),
    new TowerConstructionHandler(),
    new ContainerConstructionHandler(),
    new ObserverConstructionHandler(),
    new ExtensionConstructionHandler(),
    new LabConstructionHandler(),
    new ExtractorConstructionHandler()
  ];
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}
