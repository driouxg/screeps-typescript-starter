import { ScoutMemory } from "creeps/action/scoutHandler"
import { scoutNeededFor } from "expansion/scoutRequests"
import * as creepRoles from "../roles"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"

/** Requests a recon scout was spawned for this tick, so a second spawn in the room doesn't spawn another. */
let spawnedTick = -1
const spawnedFor = new Set<string>()

/**
 * Goal: A recon scout (see ReconHandler) for each room the player asked to scout from the dashboard, from the base
 * the request went to (see expansion/scoutRequests), when it has no recon scout free to take it. A single MOVE part:
 * 50 energy and 3 ticks of spawn time, so it goes ahead of everything but emergency defence, and never waits for
 * energy (it doesn't hold anything else up). Spawned even with scouting switched off: the player asked.
 */
export default class ReconSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (spawnedTick !== Game.time) {
      spawnedTick = Game.time
      spawnedFor.clear()
    }
    const target = scoutNeededFor(spawn.room.name)
    if (!target || spawnedFor.has(target)) return null
    spawnedFor.add(target)
    return new SpawnConfig([MOVE], creepRoles.RECON, { memory: { requestRoom: target } as ScoutMemory })
  }
}
