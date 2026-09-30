import { assessThreat, canWin } from "defence/threat"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

export const MAX_DEFENDERS = 4
const MAX_ATTACK_PARTS = 10
/** An ATTACK and a MOVE part; anything less isn't worth spawning. */
const MIN_ENERGY = BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]

/**
 * Goal: Spawn melee defenders until our towers and defenders out-damage the hostile fighters in the room. During
 * safe mode the hostiles can't fight back, so one defender is enough to finish them off.
 */
export default class MeleeDefenderSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MELEE_DEFENDER

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    const threat = assessThreat(room)
    if (threat.hostiles.length <= 0 || canWin(room, threat)) return null

    const defenders = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })
    const wanted = room.controller?.safeMode ? 1 : MAX_DEFENDERS
    if (wanted <= defenders.length) return null

    // Don't wait for a full spawn: a small defender now beats a big one after the raider has done its damage.
    if (room.energyAvailable < MIN_ENERGY) return null
    return new SpawnConfig(defenderBody(room.energyAvailable), this.role)
  }
}

/**
 * TOUGH parts in front soak the first hits, ATTACK in the middle, MOVE last so the defender can still reach its
 * target while wounded. One MOVE per ATTACK keeps it at full speed off-road.
 */
export function defenderBody(energy: number): BodyPartConstant[] {
  const pair = BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]
  const attacks = Math.min(MAX_ATTACK_PARTS, Math.floor(energy / pair))
  const tough = Math.min(attacks, Math.floor((energy - attacks * pair) / BODYPART_COST[TOUGH]))
  return [
    ...Array<BodyPartConstant>(tough).fill(TOUGH),
    ...Array<BodyPartConstant>(attacks).fill(ATTACK),
    ...Array<BodyPartConstant>(attacks).fill(MOVE)
  ]
}
