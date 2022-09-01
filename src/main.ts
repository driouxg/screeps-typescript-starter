/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import ConstructionComposer from "composer/constructionComposer"
import CreepComposer from "composer/creepComposer"
import { ErrorMapper } from "utils/ErrorMapper"
import ICreepHandler from "creeps/action/ICreepHandler"
import IStructureActionHandler from "structures/action/IStructureActionHandler"
import SpawnComposer from "composer/spawnComposer"
import StructureActionComposer from "composer/structureActionComposer"

declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory {
    uuid: number
    log: any
  }

  interface ISettings {
    constructionSite: {
      visualize: boolean
      desiredSitesConstructedPerTick: number
    }
  }

  interface RoomMemory {
    constructionPos: { [key: string]: number }
    desiredState: string[][]
    positions: { [structure: string]: RoomPosition[] }
    events: RoomEvent[]
    baseLayout: "bunker" | "cluster" | "lattice"
  }

  interface RoomEvent {
    type: RoomEventType
    tick: number
  }

  interface SpawnMemory {
    scoutLastSpawned: number
  }

  type RoomEventType = PULL_REQUEST

  type PULL_REQUEST = "PULL_REQUEST"

  type CreepReturnCode =
    | CreepActionReturnCode
    | CreepMoveReturnCode
    | ERR_NO_PATH
    | ERR_NO_PATH
    | ERR_INVALID_TARGET
    | ERR_NOT_FOUND
    | ERR_NOT_ENOUGH_RESOURCES

  export interface CreepMemory {
    role: string
    room: string
    working: boolean
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any
    }
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  initRoomMemory()
  deleteMissingCreepMemory()

  const creepComposer = new CreepComposer()
  const spawnComposer: SpawnComposer = new SpawnComposer()
  const structureActionComposer: StructureActionComposer = new StructureActionComposer()
  const constructionComposer: ConstructionComposer = new ConstructionComposer()
  const creepHandlerDict: { [creepRole: string]: ICreepHandler } = creepComposer.creepHandlerDict()

  constructionComposer.compose()
  spawnComposer.compose()
  manageCreepActions(creepHandlerDict)
  manageStructureActions(structureActionComposer.structureActionHandlers())

  deleteRoomEvents()
})

function manageCreepActions(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName]
    const handler: ICreepHandler = creepHandlerDict[creep.memory.role]
    handler.handle(creep)
  }
}

function manageStructureActions(structureActionHandlers: IStructureActionHandler[]) {
  for (const roomName in Game.rooms) {
    for (const structureActionHandler of structureActionHandlers) {
      structureActionHandler.handle(Game.rooms[roomName])
    }
  }
}

function deleteMissingCreepMemory(): void {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) delete Memory.creeps[name]
  }
}

function deleteRoomEvents(): void {
  for (const room in Game.rooms) {
    Game.rooms[room].memory.events = Game.rooms[room].memory.events.filter(e => Game.time < e.tick + 1)
  }
}

function initRoomMemory(): void {
  for (const room in Game.rooms) {
    Game.rooms[room].memory.events = Game.rooms[room].memory.events || []
  }
}
