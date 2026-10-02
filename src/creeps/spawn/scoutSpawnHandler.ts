import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { needsScouting } from "expansion/scouting"
import { scoutNeededFor } from "expansion/scoutRequests"
import { ScoutMemory } from "creeps/action/scoutHandler"
import { controls } from "config/controls"

/** With nothing new to find, a scout goes out this often to keep intel fresh. */
const REFRESH_EVERY = 3000
/** Scouting for remotes starts a level early, so they're known by the time remote mining starts (RCL 3). */
const NEEDED_MIN_RCL = 2

/**
 * One scout per room at a time (see expansion/scouting):
 * - "needed": while the room still has rooms worth discovering, a scout is kept out, ahead of the workers.
 * - "refresh": otherwise one goes out every REFRESH_EVERY ticks, after everything else.
 * - "requested": a room the player asked to scout, from the base closest to it (see expansion/scoutRequests), when
 *   none of that base's scouts is free to go: right away, even with scouting switched off.
 * Otherwise none while scouting is switched off (see config/controls).
 */
export default class ScoutSpawnHandler implements ISpawnHandler {
  public constructor(private mode: "needed" | "refresh" | "requested") {}

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    if (this.mode === "requested") {
      const target = scoutNeededFor(spawn.room.name)
      return target ? new SpawnConfig([MOVE], creepRoles.SCOUT, { memory: { requestRoom: target } as ScoutMemory }) : null
    }
    if (!controls().scouting) return null
    const room = spawn.room
    const scouts = Object.values(Game.creeps).filter(
      c => c.memory.role === creepRoles.SCOUT && c.memory.room === room.name
    ).length
    if (0 < scouts) return null

    if (this.mode === "needed") {
      if ((room.controller?.level ?? 0) < NEEDED_MIN_RCL || !needsScouting(room.name)) return null
    } else if (Game.time < (room.memory.scoutLastSpawned ?? 0) + REFRESH_EVERY) return null

    room.memory.scoutLastSpawned = Game.time
    return new SpawnConfig([MOVE], creepRoles.SCOUT)
  }
}
