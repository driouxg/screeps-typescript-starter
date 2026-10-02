import { assessThreat } from "defence/threat"
import IStructureActionHandler from "./IStructureActionHandler"

/** Losing more than this share of the spawn's hits means the next loss would be the spawn itself. */
const SPAWN_HITS_FLOOR = 0.7

declare global {
  interface RoomMemory {
    /** Tick the current raid started, while hostile fighters are in the room. */
    raidStart?: number
  }
}

/**
 * Goal: Use safe mode as the emergency brake, without wasting charges. While it's on, hostile creeps can't act in
 * the room at all, which lets defenders kill them for free. But charges are scarce (one to start, one per RCL
 * reached), so it's only used once a raid has done real damage:
 *
 * - hostiles destroyed one of our structures (the game only logs that for damage, never for decay); or
 * - a spawn has lost 30% of its hits: waiting for it to be destroyed would be too late, as a room without a spawn can't
 *   rebuild;
 * - in a room we're still expanding into (no spawn yet), hostiles attacked our creeps: the pioneers building its
 *   spawn are all it has, and nothing there fights back. Pioneers upgrade to RCL 2 first to earn the charge.
 *
 * Otherwise creeps lost to a raid don't count: they can be replaced, and towers and defenders deal with most raids.
 */
export default class SafeModeHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const threat = assessThreat(room)
    if (threat.hostiles.length <= 0) {
      delete room.memory.raidStart
      return
    }
    room.memory.raidStart = room.memory.raidStart ?? Game.time

    const controller = room.controller
    if (!controller?.my || controller.safeMode || controller.safeModeCooldown || controller.upgradeBlocked) return
    if (!controller.safeModeAvailable) return

    const spawns = room.find(FIND_MY_SPAWNS)
    const structureLost = this.structureDestroyed(room)
    const spawnFailing = spawns.some(s => s.hits < s.hitsMax * SPAWN_HITS_FLOOR)
    const pioneersAttacked = spawns.length <= 0 && this.creepAttacked(room)
    if (!structureLost && !spawnFailing && !pioneersAttacked) return

    const code = controller.activateSafeMode()
    const why = structureLost ? "a structure was destroyed" : spawnFailing ? "spawn is failing" : "pioneers attacked"
    console.log(`Safe mode in ${room.name} (${why}): ${code === OK ? "activated" : `failed (${code})`}`)
  }

  /** Whether a structure (anything but a creep) was destroyed by damage last tick. */
  private structureDestroyed(room: Room): boolean {
    return room.getEventLog().some(e => e.event === EVENT_OBJECT_DESTROYED && e.data.type !== "creep")
  }

  /** Whether one of our creeps was attacked last tick. */
  private creepAttacked(room: Room): boolean {
    return room
      .getEventLog()
      .some(e => e.event === EVENT_ATTACK && Game.getObjectById(e.data.targetId as Id<Creep>)?.my === true)
  }
}
