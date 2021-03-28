/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import ConstructionComposer from "composer/constructionComposer";
import CreepComposer from "composer/creepComposer";
import { ErrorMapper } from "utils/ErrorMapper";
import ICreepHandler from "creeps/action/ICreepHandler";
import IStructureActionHandler from "structures/action/IStructureActionHandler";
import SpawnComposer from "composer/spawnComposer";
import StructureActionComposer from "composer/structureActionComposer";

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  const creepComposer = new CreepComposer();
  const spawnComposer: SpawnComposer = new SpawnComposer();
  const structureActionComposer: StructureActionComposer = new StructureActionComposer();
  const constructionComposer: ConstructionComposer = new ConstructionComposer();
  const creepHandlerDict: { [creepRole: string]: ICreepHandler } = creepComposer.creepHandlerDict();

  constructionComposer.compose();
  spawnComposer.compose();
  manageCreepActions(creepHandlerDict);
  manageStructureActions(structureActionComposer.structureActionHandlers());

  deleteMissingCreepMemory();
  deleteRoomEvents();
});

function manageCreepActions(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName];
    const handler: ICreepHandler = creepHandlerDict[creep.memory.role];
    handler.handle(creep);
  }
}

function manageStructureActions(structureActionHandlers: IStructureActionHandler[]) {
  for (const roomName in Game.rooms) {
    for (const structureActionHandler of structureActionHandlers) {
      structureActionHandler.handle(Game.rooms[roomName]);
    }
  }
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) delete Memory.creeps[name];
  }
}

function deleteRoomEvents(): void {
  for (const room in Game.rooms) {
    Game.rooms[room].memory.events = Game.rooms[room].memory.events.filter(e => Game.time < e.tick + 1);
  }
}
