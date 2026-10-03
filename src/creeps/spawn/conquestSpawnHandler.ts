import { conquerors, conquest, ConquerorMemory } from "conquest/conquest"
import { bodyFor } from "conquest/squadMeta"
import { bodyCost } from "./utils/economy"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** A claimer is sent this long before their controller can next be attacked, to be there when it can. */
const CLAIMER_LEAD = 50

/**
 * Goal: Spawn the conquest's squads in its home (see conquest/conquest): the members of the wave being staged, one per
 * slot of the plan, saving up for each. A body the home can't build any more (it lost extensions) is rebuilt for
 * what it can. In the claim phase, a claimer with as many CLAIM parts as the home can afford, timed to reach their
 * controller as soon as it can be attacked again.
 */
export default class ConquestSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const c = conquest()
    if (!c || c.home !== spawn.room.name) return null
    const capacity = spawn.room.energyCapacityAvailable
    const ours = conquerors(c.room)

    if (c.state === "staging") {
      for (let slot = 0; slot < c.members.length; slot++) {
        const taken = ours.some(m => {
          const memory = m.memory as ConquerorMemory
          return memory.wave === c.wave && memory.slot === slot
        })
        if (taken) continue
        const planned = c.members[slot]
        const body = bodyCost(planned.body) <= capacity ? planned.body : bodyFor(planned.kind, capacity)
        return new SpawnConfig(body, creepRoles.CONQUEROR, {
          memory: { conquest: c.room, kind: planned.kind, wave: c.wave, slot } as ConquerorMemory,
          waitForEnergy: true
        })
      }
      return null
    }

    const claimable = c.state === "engaged" || c.state === "marching" || c.state === "rallying"
    if (c.phase !== "claim" || !claimable) return null
    if (ours.some(m => (m.memory as ConquerorMemory).kind === "claimer")) return null
    if (Game.time + c.travel + CLAIMER_LEAD < (c.nextClaimAttack ?? 0)) return null
    return new SpawnConfig(bodyFor("claimer", capacity), creepRoles.CONQUEROR, {
      memory: { conquest: c.room, kind: "claimer", wave: c.wave, slot: -1 } as ConquerorMemory,
      waitForEnergy: true
    })
  }
}
