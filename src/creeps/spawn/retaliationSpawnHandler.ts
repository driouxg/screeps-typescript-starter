import { retaliation } from "defence/retaliation"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import { defenderBody } from "./meleeDefenderSpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { RetaliatorMemory } from "creeps/action/retaliatorHandler"

/**
 * Most energy per squad member. Strikes only go where there are no working towers (see defence/retaliation), so
 * small bodies are enough, and saving up for full-size ones held the home's economy up for thousands of ticks.
 */
const ATTACKER_ENERGY = 800
const HEALER_ENERGY = 600

/**
 * Goal: Spawn the squad of a strike on a player who attacked us (see defence/retaliation), in the home it was
 * planned from: its attackers, then its healer, up to ATTACKER_ENERGY / HEALER_ENERGY each, saving up for them.
 */
export default class RetaliationSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const r = retaliation()
    if (!r || r.state !== "spawning" || r.home !== spawn.room.name) return null

    const members = Object.values(Game.creeps).filter(c => c.memory.role === creepRoles.RETALIATOR)
    const count = (kind: RetaliatorMemory["kind"]) =>
      members.filter(c => (c.memory as RetaliatorMemory).kind === kind).length
    const capacity = spawn.room.energyCapacityAvailable

    let kind: RetaliatorMemory["kind"]
    let body: BodyPartConstant[]
    if (count("attacker") < (r.attackers ?? 0)) {
      kind = "attacker"
      body = defenderBody(Math.min(capacity, ATTACKER_ENERGY))
    } else if (count("healer") < (r.healers ?? 0)) {
      kind = "healer"
      const pair = BODYPART_COST[HEAL] + BODYPART_COST[MOVE]
      const pairs = Math.max(1, Math.floor(Math.min(capacity, HEALER_ENERGY) / pair))
      body = [...Array<BodyPartConstant>(pairs).fill(HEAL), ...Array<BodyPartConstant>(pairs).fill(MOVE)]
    } else return null

    return new SpawnConfig(body, creepRoles.RETALIATOR, {
      memory: { kind } as RetaliatorMemory,
      waitForEnergy: true
    })
  }
}
