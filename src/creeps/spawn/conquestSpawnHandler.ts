import { activeConquests, basesOf, conquerors, ConquerorMemory } from "conquest/conquest"
import { bodyFor } from "conquest/squadMeta"
import { bodyCost } from "./utils/economy"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** A claimer is sent this long before their controller can next be attacked, to be there when it can. */
const CLAIMER_LEAD = 50

/** Wave slots a spawn took this tick (conquest:wave:slot), so another base's spawn doesn't take the same one. */
let takenTick = -1
const taken = new Set<string>()

/**
 * Goal: Spawn the conquests' squads (see conquest/conquest) from all of each one's bases at once, so a wave is ready
 * as soon as possible: every idle spawn of a base on a conquest takes the first member of the wave being staged that
 * nobody has spawned yet and its base can build, saving up for it. A member too big for this base is left for a
 * bigger one among the conquest's bases (only the biggest rebuilds it for its own capacity, if even that can't build
 * it, say after losing extensions). A slot is taken for the tick only once the spawn can afford it, so a base that
 * has to save up doesn't hold up one that could spawn it now.
 *
 * In the claim phase, the conquest's home (the nearest base) sends a claimer with as many CLAIM parts as it can
 * afford, timed to reach their controller as soon as it can be attacked again.
 */
export default class ConquestSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (takenTick !== Game.time) {
      takenTick = Game.time
      taken.clear()
    }
    const base = spawn.room
    const capacity = base.energyCapacityAvailable

    for (const c of activeConquests()) {
      const bases = basesOf(c)
      if (!bases.includes(base.name)) continue
      const ours = conquerors(c.room)

      if (c.state === "staging") {
        const biggest = Math.max(...bases.map(name => Game.rooms[name]?.energyCapacityAvailable ?? 0))
        for (let slot = 0; slot < c.members.length; slot++) {
          const key = `${c.room}:${c.wave}:${slot}`
          if (taken.has(key)) continue
          const spawned = ours.some(m => {
            const memory = m.memory as ConquerorMemory
            return memory.wave === c.wave && memory.slot === slot
          })
          if (spawned) continue
          const planned = c.members[slot]
          let body = planned.body
          if (capacity < bodyCost(body)) {
            // Another of its bases can build it: leave it to that one.
            if (capacity < biggest) continue
            body = bodyFor(planned.kind, capacity)
          }
          if (bodyCost(body) <= base.energyAvailable) taken.add(key)
          return new SpawnConfig(body, creepRoles.CONQUEROR, {
            memory: { conquest: c.room, kind: planned.kind, wave: c.wave, slot } as ConquerorMemory,
            waitForEnergy: true
          })
        }
        continue
      }

      if (base.name !== c.home) continue
      const claimable = c.state === "engaged" || c.state === "marching" || c.state === "rallying"
      if (c.phase !== "claim" || !claimable) continue
      if (ours.some(m => (m.memory as ConquerorMemory).kind === "claimer")) continue
      if (Game.time + c.travel + CLAIMER_LEAD < (c.nextClaimAttack ?? 0)) continue
      return new SpawnConfig(bodyFor("claimer", capacity), creepRoles.CONQUEROR, {
        memory: { conquest: c.room, kind: "claimer", wave: c.wave, slot: -1 } as ConquerorMemory,
        waitForEnergy: true
      })
    }
    return null
  }
}
