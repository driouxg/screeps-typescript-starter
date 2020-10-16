/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import ConstructionHandler from "./construction/constructionHandler";
import ContainerConstructionHandler from "construction/containerConstructionHandler";
import CreepComposer from "composer/creepComposer";
import { ErrorMapper } from "utils/ErrorMapper";
import ExtensionConstructionHandler from "construction/extensionConstructionHandler";
import ExtractorConstructionHandler from "construction/extractorConstructionHandler";
import FactoryConstructionHandler from "construction/factoryConstructionHandler";
import IConstructionHandler from "construction/IConstructionHandler";
import ICreepHandler from "creeps/ICreepHandler";
import ISpawnHandler from "spawns/ISpawnHandler";
import LabConstructionHandler from "construction/labConstructionHandler";
import LinkConstructionHandler from "construction/linkConstructionHandler";
import NukerConstructionHandler from "construction/nukerConstructionHandler";
import ObserverConstructionHandler from "construction/observerConstructionHandler";
import PowerSpawnConstructionHandler from "construction/powerSpawnConstructionHandler";
import RoadConstructionHandler from "construction/roadConstructionHandler";
import SpawnComposer from "composer/spawnComposer";
import SpawnConfig from "spawns/SpawnConfig";
import SpawnConstructionHandler from "construction/spawnConstructionHandler";
import StorageConstructionHandler from "construction/storageConstructionHandler";
import TerminalConstructionHandler from "construction/terminalConstructionHandler";
import TowerConstructionHandler from "construction/towerConstructionHandler";
import WallConstructionHandler from "construction/wallConstructionHandler";
import generateGuid from "./utils/guidGenerator";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const creepComposer = new CreepComposer();
  const spawnComposer: SpawnComposer = new SpawnComposer();
  const creepHandlerDict: { [creepRole: string]: ICreepHandler } = creepComposer.creepHandlerDict();
  const constructionHandler: ConstructionHandler = new ConstructionHandler(constructionHandlers());

  spawnCreeps(spawnComposer);
  manageCreeps(creepHandlerDict);
  constructionHandler.handle();

  deleteMissingCreepMemory();
});

function manageCreeps(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName];
    const handler: ICreepHandler = creepHandlerDict[creep.memory.role];
    handler.handle(creep);
  }
}

function spawnCreeps(spawnComposer: SpawnComposer): void {
  for (const spawnName in Game.spawns) {
    const spawn: StructureSpawn = Game.spawns[spawnName];
    if (spawn.spawning) continue;

    const spawner: ISpawnHandler = spawnComposer.spawner(spawn);
    const spawnConfig: SpawnConfig | null = spawner.spawnCreep();
    if (!spawnConfig) continue;

    spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
      memory: { role: spawnConfig.getRole(), working: false, room: spawn.room.name }
    });
  }
}

function constructionHandlers(): IConstructionHandler[] {
  return [
    new RoadConstructionHandler(),
    new WallConstructionHandler(),
    new StorageConstructionHandler(),
    new LinkConstructionHandler(),
    new PowerSpawnConstructionHandler(),
    new NukerConstructionHandler(),
    new SpawnConstructionHandler(),
    new TerminalConstructionHandler(),
    new FactoryConstructionHandler(),
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
