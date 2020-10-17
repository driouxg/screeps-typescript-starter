/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import ConstructionComposer from "composer/constructionComposer";
import ConstructionHandler from "./structures/construction/constructionHandler";
import CreepComposer from "composer/creepComposer";
import { ErrorMapper } from "utils/ErrorMapper";
import IConstructionHandler from "structures/construction/IConstructionHandler";
import ICreepHandler from "creeps/action/ICreepHandler";
import ISpawnHandler from "creeps/spawn/ISpawnHandler";
import IStructureActionHandler from "structures/action/IStructureActionHandler";
import SpawnComposer from "composer/spawnComposer";
import SpawnConfig from "creeps/spawn/SpawnConfig";
import StructureActionComposer from "composer/structureActionComposer";
import StructureActionHandler from "structures/action/structureActionHandler";
import generateGuid from "./utils/guidGenerator";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const creepComposer = new CreepComposer();
  const spawnComposer: SpawnComposer = new SpawnComposer();
  const structureActionComposer: StructureActionComposer = new StructureActionComposer();
  const constructionComposer: ConstructionComposer = new ConstructionComposer();
  const creepHandlerDict: { [creepRole: string]: ICreepHandler } = creepComposer.creepHandlerDict();

  manageCreepSpawning(spawnComposer);
  manageCreepActions(creepHandlerDict);
  manageConstruction(constructionComposer.constructionHandlers());
  manageStructureActions(structureActionComposer.structureActionHandlers());

  deleteMissingCreepMemory();
});

function manageCreepActions(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
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

function manageCreepSpawning(spawnComposer: SpawnComposer): void {
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

function manageStructureActions(structureActionHandlers: IStructureActionHandler[]) {
  // const structureActionHandler: StructureActionHandler = new StructureActionHandler(structureActionHandlers);
  for (const roomName in Game.rooms) {
    for (const structureActionHandler of structureActionHandlers) {
      structureActionHandler.handle(Game.rooms[roomName]);
    }
  }
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
}
