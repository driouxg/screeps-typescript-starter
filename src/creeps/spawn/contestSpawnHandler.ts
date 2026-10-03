import { CONTEST_ATTACKERS, contesters, MIN_CONTEST_CLAIM } from "remote/contest"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import { defenderBody } from "./meleeDefenderSpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { ContesterMemory } from "creeps/action/contesterHandler"
import { ReserverMemory } from "creeps/action/reserverHandler"

/** Most RANGED_ATTACK parts on a ranged contester (each with a MOVE). */
const MAX_RANGED = 10

/** RANGED_ATTACK and MOVE pairs, as many as the room can afford (up to MAX_RANGED). */
function rangedBody(capacity: number): BodyPartConstant[] {
  const pair = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]
  const pairs = Math.max(1, Math.min(MAX_RANGED, Math.floor(capacity / pair)))
  return [...Array<BodyPartConstant>(pairs).fill(RANGED_ATTACK), ...Array<BodyPartConstant>(pairs).fill(MOVE)]
}

/** Most CLAIM parts on a contest's reserver (each with a MOVE): each takes a tick off their reservation per tick. */
const MAX_CLAIM = 5

/**
 * Goal: Staff the contests this spawn's room sends (see remote/contest): CONTEST_ATTACKERS attackers, a melee one and
 * then ranged ones (they catch creeps that run from the melee one), replaced as they fall; and once they're all out, a
 * reserver with MIN_CONTEST_CLAIM to MAX_CLAIM CLAIM parts to run down the other player's reservation and reserve the
 * room, from the contest's reserverHome when its own base can't afford one.
 */
export default class ContestSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const home = spawn.room
    for (const [roomName, contest] of Object.entries(Memory.remoteContests ?? {})) {
      const sendsAttackers = contest.home === home.name
      const sendsReserver = (contest.reserverHome ?? contest.home) === home.name
      if (!sendsAttackers && !sendsReserver) continue

      const attackers = contesters(roomName)
      if (sendsAttackers && attackers.length < CONTEST_ATTACKERS) {
        const melee = attackers.some(c => (c.memory as ContesterMemory).kind !== "ranged")
        const kind: ContesterMemory["kind"] = melee ? "ranged" : "melee"
        const capacity = home.energyCapacityAvailable
        return new SpawnConfig(kind === "melee" ? defenderBody(capacity) : rangedBody(capacity), creepRoles.CONTESTER, {
          memory: { targetRoom: roomName, kind } as ContesterMemory,
          waitForEnergy: true
        })
      }

      // Their reserver would just put the reservation back: only once our attackers are out.
      if (!sendsReserver || attackers.length < CONTEST_ATTACKERS || attackers.some(c => c.spawning)) continue
      const reserving = Object.values(Game.creeps).some(
        c => c.memory.role === creepRoles.RESERVER && (c.memory as { targetRoom?: string }).targetRoom === roomName
      )
      if (reserving) continue
      const pair = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
      const pairs = Math.min(MAX_CLAIM, Math.floor(home.energyCapacityAvailable / pair))
      if (pairs < MIN_CONTEST_CLAIM) continue // can't hold the room (see MIN_CONTEST_CLAIM)
      return new SpawnConfig(
        [...Array<BodyPartConstant>(pairs).fill(CLAIM), ...Array<BodyPartConstant>(pairs).fill(MOVE)],
        creepRoles.RESERVER,
        { memory: { targetRoom: roomName } as ReserverMemory, waitForEnergy: true }
      )
    }
    return null
  }
}
