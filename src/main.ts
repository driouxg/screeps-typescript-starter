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
    Note: Values, properties defined here do no fully *exist* by this type definition alone.
          You must also give them an implementation if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

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
    buildCursor: number
    buildOrder: BuildOrderStep[]
    positions: { [structure: string]: RoomPositionJson[] }
    events: RoomEvent[]
    lastScouted: number
    status:
      | "reservedMy"
      | "reservedEnemy"
      | "unseen"
      | "claimedMy"
      | "claimedEnemy"
      | "hostile"
      | "unclaimable"
      | "ownedMy"
      | "ownedEnemy"
      | "aggressive" // Enemy creeps in room with ATTACK body part
    watchers: { [direction: string]: number }
    minerPositions: { sourceId: string; pos: RoomPositionJson }[]
  }

  interface RoomEvent {
    type: RoomEventType
    tick: number
  }

  type BuildOrderStep = { x: number; y: number; structureType: BuildableStructureConstant }

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
    // path: RoomPositionJson[]  // I added because moveTo
  }

  export type RoomPositionJson = {
    x: number
    y: number
    roomName: string
  }
}
// Syntax for adding properties to `global` (ex "global.log")
declare const global: {
  log: any
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
  let startCpu = 0,
    conCpu = 0,
    spawnCpu = 0,
    creepCpu = 0,
    structureCpu = 0

  initRoomMemory()
  startCpu = Game.cpu.getUsed()
  deleteMissingCreepMemory()

  manageCreepActions(new CreepComposer().creepHandlerDict())
  creepCpu = Game.cpu.getUsed()
  new SpawnComposer().compose()
  spawnCpu = Game.cpu.getUsed()
  manageStructureActions(new StructureActionComposer().structureActionHandlers())
  structureCpu = Game.cpu.getUsed()
  new ConstructionComposer().compose()
  conCpu = Game.cpu.getUsed()

  if (Game.time % 10000 === 0)
    console.log(
      `CPU USAGE: \n startCpu: ${startCpu} \n conCpu: ${conCpu - structureCpu} \n spawnCpu: ${
        spawnCpu - creepCpu
      } \n creepCpu: ${creepCpu - startCpu} \n structureCpu: ${structureCpu - spawnCpu}`
    )

  deleteRoomEvents()
})

function manageCreepActions(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName]
    const handler: ICreepHandler = creepHandlerDict[creep.memory.role]
    // console.log("Handling creep with role: ", creep.memory.role, JSON.stringify(creep.memory))
    handler.handle(creep)
  }
}

function manageStructureActions(structureActionHandlers: IStructureActionHandler[]) {
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName]
    if (!myClaimedRoom(room)) continue
    for (const structureActionHandler of structureActionHandlers) {
      structureActionHandler.handle(room)
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
    Game.rooms[room].memory.status = Game.rooms[room].memory.status || "unseen"
    Game.rooms[room].memory.lastScouted = Game.rooms[room].memory.lastScouted || 0
  }
}

export function myClaimedRoom(room: Room): boolean {
  return room && room.controller !== undefined && room.controller!.my
}
