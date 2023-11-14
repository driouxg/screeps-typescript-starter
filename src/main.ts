import MinerHandler from "creeps/action/MinerHandler"
import SpawnHaulerEventEmitter from "eventEmitters/SpawnHaulerEventEmitter"
import SpawnMinerEventEmitter from "eventEmitters/SpawnMinerEventEmitter"
import SpawnHandler from "eventHandlers/spawnHandler"
import ConstructionComposer from "roomPlans/roomPlanner"
import { ErrorMapper } from "utils/ErrorMapper"
import Event from "utils/Event"

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
    events: Event[]
  }

  interface CreepMemory {
    role: string
    room: string
    working: boolean
  }

  interface RoomMemory {
    buildCursor: number
    buildOrder: BuildOrderStep[]
    positions: { [structure: string]: RoomPositionJson[] }
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
    // watchers: { [direction: string]: number }
    // minerPositions: { sourceId: string; pos: RoomPositionJson }[]
  }

  type BuildOrderStep = { x: number; y: number; structureType: BuildableStructureConstant }

  export type RoomPositionJson = {
    x: number
    y: number
    roomName: string
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
  Memory.events = Memory.events || []

  const creepHandlers = [new MinerHandler()]
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName]

    creepHandlers.forEach(ch => ch.handle(creep))
  }

  const eventHandlers = [new SpawnHandler()]
  for (const event of Memory.events) {
    eventHandlers.forEach(eh => eh.handle(event))
  }

  const eventEmitters = [new SpawnMinerEventEmitter(), new SpawnHaulerEventEmitter()]
  eventEmitters.forEach(em => em.emit())

  // upgraders: form a 3x3 square and just sit there upgrading, haulers will bring resources

  new ConstructionComposer().compose()

  Memory.events = Memory.events.filter(e => e.handled === false)

  deleteMissingCreepMemory()
  // deleteOldRoomMemory()
})

function deleteMissingCreepMemory() {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) delete Memory.creeps[name]
  }
}

export function myClaimedRoom(room: Room): boolean {
  return room && room.controller !== undefined && room.controller!.my
}

export function deleteOldRoomMemory(): void {
  for (const roomName in Memory.rooms) {
    delete Memory.rooms[roomName]
  }
}
