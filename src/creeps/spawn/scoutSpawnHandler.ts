import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { needsScouting } from "expansion/scouting"
import { controls } from "config/controls"

/** With nothing new to find, a scout goes out this often to keep intel fresh. */
const REFRESH_EVERY = 3000
/** Scouting for remotes starts a level early, so they're known by the time remote mining starts (RCL 3). */
const NEEDED_MIN_RCL = 2

/**
 * One scout per room at a time (see expansion/scouting):
 * - "needed": while the room still has rooms worth discovering, a scout is kept out, ahead of the workers.
 * - "refresh": otherwise one goes out every REFRESH_EVERY ticks, after everything else.
 * None while scouting is switched off (see config/controls). Rooms the player asks to scout get a recon scout of their
 * own (see ReconSpawnHandler).
 */
export default class ScoutSpawnHandler implements ISpawnHandler {
  public constructor(private mode: "needed" | "refresh") {}

  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
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
