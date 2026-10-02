import { containerBuilt, isRemoteRoomActive } from "remote/remoteCreeps"
import { maintainersWanted } from "remote/highway"
import { haulerBody, maintainerBody, minerBody } from "remote/remoteBodies"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** Reserve again when the reservation drops below this (it lasts at most 5000 ticks). */
const RESERVATION_LOW = 2000
/** A miner (3 MOVE for 7 other parts) walks about this many ticks per tile off-road: its replacement leaves early. */
const MINER_TICKS_PER_TILE = 2.5

/**
 * Goal: Staff the remote sources RemotePlanner chose for this spawn's room, best first: a miner each (replaced before
 * the old one dies, allowing for its walk); then the home's highway maintainers, when its roads need them (see
 * maintainersWanted); then haulers (once the miner has built the container) until they have the CARRY parts each
 * source needs; then a reserver for rooms worth reserving whose reservation is running low. Bodies come from
 * remoteBodies, the same the planner priced.
 *
 * Maintainers go ahead of haulers: until the highway is built, haulers are slow and need far more CARRY, so topping
 * them up never ended and the maintainer never got its turn, which kept the roads from ever being built.
 */
export default class RemoteSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const home = spawn.room
    const capacity = home.energyCapacityAvailable
    const remotes = Object.values(Memory.remotes ?? {})
      .filter(r => r.home === home.name && isRemoteRoomActive(r.room))
      .sort((a, b) => b.net - a.net)

    const creeps = Object.values(Game.creeps)
    const serving = (role: string, key: string, value: string) =>
      creeps.filter(c => c.memory.role === role && (c.memory as unknown as Record<string, string>)[key] === value)
    const aliveFor = (c: Creep, ticks: number) => c.spawning || ticks < (c.ticksToLive ?? 0)

    for (const r of remotes) {
      const income = (r.reserve ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_NEUTRAL_CAPACITY) / ENERGY_REGEN_TIME
      const miner = minerBody(capacity, income, r.roads)
      const minerLead = r.distance * MINER_TICKS_PER_TILE + miner.length * CREEP_SPAWN_TIME
      if (!serving(creepRoles.REMOTE_MINER, "targetSourceId", r.id).some(m => aliveFor(m, minerLead)))
        return this.config(miner, creepRoles.REMOTE_MINER, { targetSourceId: r.id })
    }

    const maintainers = creeps.filter(
      c => c.memory.role === creepRoles.HIGHWAY_MAINTAINER && c.memory.room === home.name
    ).length
    if (maintainers < maintainersWanted(home.name))
      return this.config(maintainerBody(capacity), creepRoles.HIGHWAY_MAINTAINER, {})

    for (const r of remotes) {
      // No haulers until the miner has built the source's container: until then there's nothing for them to collect.
      if (!containerBuilt(r)) continue
      const carry = serving(creepRoles.REMOTE_HAULER, "targetSourceId", r.id)
        .filter(h => aliveFor(h, 2 * r.travel))
        .reduce((sum, h) => sum + h.getActiveBodyparts(CARRY), 0)
      if (carry < r.carryParts)
        return this.config(haulerBody(capacity, r.carryParts - carry), creepRoles.REMOTE_HAULER, {
          targetSourceId: r.id
        })
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
