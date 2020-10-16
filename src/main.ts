/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import ConstructionComposer from "composer/constructionComposer";
import ConstructionHandler from "./construction/constructionHandler";
import CreepComposer from "composer/creepComposer";
import { ErrorMapper } from "utils/ErrorMapper";
import ICreepHandler from "creeps/action/ICreepHandler";
import ISpawnHandler from "creeps/spawn/ISpawnHandler";
import SpawnComposer from "composer/spawnComposer";
import SpawnConfig from "creeps/spawn/SpawnConfig";
import generateGuid from "./utils/guidGenerator";
import IConstructionHandler from "construction/IConstructionHandler";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const creepComposer = new CreepComposer();
  const spawnComposer: SpawnComposer = new SpawnComposer();
  const constructionComposer: ConstructionComposer = new ConstructionComposer();
  const creepHandlerDict: { [creepRole: string]: ICreepHandler } = creepComposer.creepHandlerDict();

  manageSpawningCreeps(spawnComposer);
  manageCreeps(creepHandlerDict);
  manageConstruction(constructionComposer.constructionHandlers());

  deleteMissingCreepMemory();
});

function manageCreeps(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName];
    const handler: ICreepHandler = creepHandlerDict[creep.memory.role];
    handler.handle(creep);
  }
}

function manageConstruction(constructionHandlers: IConstructionHandler[]): void {
  const constructionHandler: ConstructionHandler = new ConstructionHandler(constructionHandlers);
  constructionHandler.handle();
}

function manageSpawningCreeps(spawnComposer: SpawnComposer): void {
  for (const spawnName in Game.spawns) {
    const spawn: StructureSpawn = Game.spawns[spawnName];
    if (spawn.spawning) continue;

    const spawner: ISpawnHandler = spawnComposer.spawner(spawn);
    const spawnConfig: SpawnConfig = spawner.spawnCreep();
    if (spawnConfig.getBody().length === 0) continue;

    spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
      memory: { role: spawnConfig.getRole(), working: false, room: spawn.room.name }
    });
  }
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}
