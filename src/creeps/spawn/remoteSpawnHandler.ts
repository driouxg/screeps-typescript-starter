import { containerBuilt, isRemoteRoomActive } from "remote/remoteCreeps"
import { maintainersWanted } from "remote/highway"
import { haulerBody, maintainerBody, minerBody } from "remote/remoteBodies"
import * as creepRoles from "../roles"
import { myUsername } from "utils/username"
import { RESERVER_BODY, reservingBase } from "remote/reserving"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** Reserve again when the reservation drops below this (it lasts at most 5000 ticks)... */
const RESERVATION_LOW = 2000
/** ...and ahead of the maintainers and haulers when it's below this, about to lapse (halving the room's sources). */
const RESERVATION_URGENT = 500
/** A miner (3 MOVE for 7 other parts) walks about this many ticks per tile off-road: its replacement leaves early. */
const MINER_TICKS_PER_TILE = 2.5

/**
 * Goal: Staff the remote sources RemotePlanner chose for this spawn's room, best first: a miner each (replaced before
 * the old one dies, allowing for its walk), but in a room to reserve that isn't reserved by us yet, its reserver first
 * (when this base is the one that reserves it: a base that can't afford a reserver has a stronger one nearby reserve
 * its remotes, see remote/reserving),
 * so the room is ours before the miner builds a container in it; then a reserver for rooms whose reservation is about
 * to lapse (RESERVATION_URGENT); then the home's highway maintainers, when its roads need them (see maintainersWanted);
 * then haulers (once the miner has built the container) until they have the CARRY parts each source needs; then a
 * reserver for rooms whose reservation is running low (RESERVATION_LOW). Bodies come from remoteBodies, the same the
 * planner priced.
 *
 * Maintainers, and reservers about to lapse, go ahead of haulers: until the highway is built, haulers are slow and
 * need far more CARRY, so topping them up never ended, reservations lapsed (halving the sources) and the maintainer
 * never got its turn. Routine reserving comes after the haulers: a reserver adds only a tick a tick to the
 * reservation, so one was nearly always due, and ahead of the haulers it kept them from ever spawning.
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
      if (!serving(creepRoles.REMOTE_MINER, "targetSourceId", r.id).some(m => aliveFor(m, minerLead))) {
        const ours = Game.rooms[r.room]?.controller?.reservation?.username === myUsername()
        const reserver = reservingBase(r.room, r.home) === home.name // else a stronger base nearby sends it
        if (r.reserve && reserver && !ours && serving(creepRoles.RESERVER, "targetRoom", r.room).length <= 0)
          return this.config(RESERVER_BODY, creepRoles.RESERVER, { targetRoom: r.room })
        return this.config(miner, creepRoles.REMOTE_MINER, { targetSourceId: r.id })
      }
    }

    // Rooms this base keeps reserved: its own remotes', and those of weaker bases nearby that can't afford a reserver.
    const toReserve = Object.values(Memory.remotes ?? {}).filter(
      r => r.reserve && isRemoteRoomActive(r.room) && reservingBase(r.room, r.home) === home.name
    )
    /** A reserver for the first reserved room whose reservation is below `below` and has no reserver on the way. */
    const reserverFor = (below: number): SpawnConfig | null => {
      for (const room of new Set(toReserve.map(r => r.room))) {
        const distance = Math.min(...toReserve.filter(r => r.room === room).map(r => r.distance))
        const reservers = serving(creepRoles.RESERVER, "targetRoom", room)
        if (reservers.some(c => aliveFor(c, distance + 20))) continue
        const reserved = Game.rooms[room]?.controller?.reservation?.ticksToEnd ?? 0
        if (below <= reserved) continue
        return this.config(RESERVER_BODY, creepRoles.RESERVER, { targetRoom: room })
      }
      return null
    }
    const urgent = reserverFor(RESERVATION_URGENT)
    if (urgent) return urgent

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

    return reserverFor(RESERVATION_LOW)
  }

  private config(body: BodyPartConstant[], role: string, memory: object): SpawnConfig {
    return new SpawnConfig(body, role, { memory: memory as CreepMemory, waitForEnergy: true })
  }
}
