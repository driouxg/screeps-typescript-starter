import { CONTEST_ATTACKERS, contesters } from "remote/contest"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import { defenderBody } from "./meleeDefenderSpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { ContesterMemory } from "creeps/action/contesterHandler"
import { ReserverMemory } from "creeps/action/reserverHandler"

/** Most CLAIM parts on a contest's reserver (each with a MOVE): each takes a tick off their reservation per tick. */
const MAX_CLAIM = 5

/**
 * Goal: Staff the contests this spawn's room sends (see remote/contest): CONTEST_ATTACKERS attackers, replaced as they
 * fall, and once they're all out, a reserver to run down the other player's reservation and reserve the room.
 */
export default class ContestSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const home = spawn.room
    for (const [roomName, contest] of Object.entries(Memory.remoteContests ?? {})) {
      if (contest.home !== home.name) continue

      const attackers = contesters(roomName)
      if (attackers.length < CONTEST_ATTACKERS)
        return new SpawnConfig(defenderBody(home.energyCapacityAvailable), creepRoles.CONTESTER, {
          memory: { targetRoom: roomName } as ContesterMemory,
          waitForEnergy: true
        })

      // Their reserver would just put the reservation back: only once our attackers are out.
      if (attackers.some(c => c.spawning)) continue
      const reserving = Object.values(Game.creeps).some(
        c => c.memory.role === creepRoles.RESERVER && (c.memory as { targetRoom?: string }).targetRoom === roomName
      )
      if (reserving) continue
      const pair = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
      const pairs = Math.max(1, Math.min(MAX_CLAIM, Math.floor(home.energyCapacityAvailable / pair)))
      return new SpawnConfig(
        [...Array<BodyPartConstant>(pairs).fill(CLAIM), ...Array<BodyPartConstant>(pairs).fill(MOVE)],
        creepRoles.RESERVER,
        { memory: { targetRoom: roomName } as ReserverMemory, waitForEnergy: true }
      )
    }
    return null
  }
}
