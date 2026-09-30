import { RemoteSource } from "remote/remotePlanner"
import { isRemoteRoomActive } from "remote/remoteCreeps"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** Reserve again when the reservation drops below this (it lasts at most 5000 ticks). */
const RESERVATION_LOW = 2000
const MAX_HAULER_PAIRS = 16

/**
 * Goal: Staff the remote sources RemotePlanner chose for this spawn's room, best first: a miner (replaced before the
 * old one dies, allowing for its walk), haulers until they have the CARRY parts the source's distance needs, and a
 * reserver for rooms worth reserving whose reservation is running low.
 */
export default class RemoteSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const home = spawn.room
    const remotes = Object.values(Memory.remotes ?? {})
      .filter(r => r.home === home.name && isRemoteRoomActive(r.room))
      .sort((a, b) => b.net - a.net)
    if (remotes.length <= 0) return null

    const creeps = Object.values(Game.creeps)
    const serving = (role: string, key: string, value: string) =>
      creeps.filter(c => c.memory.role === role && (c.memory as unknown as Record<string, string>)[key] === value)
    const aliveFor = (c: Creep, ticks: number) => c.spawning || ticks < (c.ticksToLive ?? 0)

    for (const r of remotes) {
      const travel = r.distance + 10
      const miners = serving(creepRoles.REMOTE_DROP_MINER, "targetSourceId", r.id)
      if (!miners.some(m => aliveFor(m, travel + minerBody(r).length * CREEP_SPAWN_TIME)))
        return this.config(minerBody(r), creepRoles.REMOTE_DROP_MINER, { targetSourceId: r.id })

      const carry = serving(creepRoles.REMOTE_HAULER, "targetSourceId", r.id)
        .filter(h => aliveFor(h, 2 * travel))
        .reduce((sum, h) => sum + h.getActiveBodyparts(CARRY), 0)
      if (carry < r.carryParts) {
        const affordable = Math.floor(home.energyCapacityAvailable / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE]))
        const pairs = Math.max(1, Math.min(r.carryParts - carry, affordable, MAX_HAULER_PAIRS))
        return this.config(pairBody(pairs), creepRoles.REMOTE_HAULER, { targetSourceId: r.id })
      }
    }

    for (const room of new Set(remotes.filter(r => r.reserve).map(r => r.room))) {
      const distance = Math.min(...remotes.filter(r => r.room === room).map(r => r.distance))
      const reservers = serving(creepRoles.RESERVER, "targetRoom", room)
      if (reservers.some(c => aliveFor(c, distance + 20))) continue
      const reserved = Game.rooms[room]?.controller?.reservation?.ticksToEnd ?? 0
      if (RESERVATION_LOW <= reserved) continue
      return this.config([CLAIM, CLAIM, MOVE, MOVE], creepRoles.RESERVER, { targetRoom: room })
    }

    return null
  }

  private config(body: BodyPartConstant[], role: string, memory: object): SpawnConfig {
    return new SpawnConfig(body, role, { memory: memory as CreepMemory, waitForEnergy: true })
  }
}

function minerBody(r: RemoteSource): BodyPartConstant[] {
  return [
    ...Array<BodyPartConstant>(r.workParts).fill(WORK),
    ...Array<BodyPartConstant>(Math.ceil(r.workParts / 2)).fill(MOVE)
  ]
}

function pairBody(pairs: number): BodyPartConstant[] {
  return [...Array<BodyPartConstant>(pairs).fill(CARRY), ...Array<BodyPartConstant>(pairs).fill(MOVE)]
}
