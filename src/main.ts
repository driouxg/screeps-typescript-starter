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
import { clearLoiterersFromSpawns } from "creeps/action/common/parking"
import { fleeIfThreatened } from "defence/flee"
import { recordAggression } from "config/relations"
import ExpansionPlanner from "expansion/expansionPlanner"
import { runRetaliation } from "defence/retaliation"
import { runScoutRequests } from "expansion/scoutRequests"
import RemotePlanner from "remote/remotePlanner"
import { drawHighways } from "remote/highwayVisualizer"
import { report } from "dashboard/report"

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
    /** CPU per creep role and main loop phase, while it exists (see profile). */
    cpuProfile?: { [key: string]: { cpu: number; calls: number } }
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
  recordAggression()
  startCpu = Game.cpu.getUsed()
  deleteMissingCreepMemory()

  manageCreepActions(new CreepComposer().creepHandlerDict())
  clearLoiterersFromSpawns()
  creepCpu = Game.cpu.getUsed()
  new ExpansionPlanner().run()
  new RemotePlanner().run()
  runRetaliation()
  runScoutRequests()
  // Only a display: a failure here mustn't stop the rest of the tick.
  try {
    drawHighways()
  } catch (e) {
    console.log(`Highway overlay failed: ${e instanceof Error ? e.stack : e}`)
  }
  profile("planners", Game.cpu.getUsed() - creepCpu)
  const planCpu = Game.cpu.getUsed()
  new SpawnComposer().compose()
  spawnCpu = Game.cpu.getUsed()
  profile("spawning", spawnCpu - planCpu)
  manageStructureActions(new StructureActionComposer().structureActionHandlers())
  structureCpu = Game.cpu.getUsed()
  profile("structures", structureCpu - spawnCpu)
  new ConstructionComposer().compose()
  conCpu = Game.cpu.getUsed()
  profile("construction", conCpu - structureCpu)

  if (Game.time % 10000 === 0)
    console.log(
      `CPU USAGE: \n startCpu: ${startCpu} \n conCpu: ${conCpu - structureCpu} \n spawnCpu: ${
        spawnCpu - creepCpu
      } \n creepCpu: ${creepCpu - startCpu} \n structureCpu: ${structureCpu - spawnCpu}`
    )

  // Last, so it reports what this tick decided (see dashboard/report.ts).
  const reportCpu = Game.cpu.getUsed()
  report()
  profile("dashboard", Game.cpu.getUsed() - reportCpu)

  deleteRoomEvents()
})

/**
 * CPU profiling, off unless `Memory.cpuProfile` exists (set it to {} from the console, or the bench does): adds up
 * CPU and calls per key (creep role or main loop phase), e.g. Memory.cpuProfile["creep:BUILDER"] = { cpu, calls }.
 * Divide cpu by calls for the average per creep per tick.
 */
function profile(key: string, cpu: number): void {
  const p = Memory.cpuProfile
  if (!p) return
  const e = p[key] || (p[key] = { cpu: 0, calls: 0 })
  e.cpu += cpu
  e.calls++
}

function manageCreepActions(creepHandlerDict: { [creepRole: string]: ICreepHandler }): void {
  for (const creepName in Game.creeps) {
    const creep: Creep = Game.creeps[creepName]
    const handler: ICreepHandler | undefined = creepHandlerDict[creep.memory.role]
    if (!handler) continue

    // One creep failing shouldn't stop the rest of the tick (other creeps, spawning, construction).
    const before = Game.cpu.getUsed()
    try {
      if (fleeIfThreatened(creep)) continue
      handler.handle(creep)
    } catch (e) {
      console.log(`Error in ${creep.memory.role} ${creep.name}: ${e instanceof Error ? e.stack : e}`)
    } finally {
      profile(`creep:${creep.memory.role}`, Game.cpu.getUsed() - before)
    }
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
