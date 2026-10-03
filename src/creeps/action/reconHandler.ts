import { requestOpen } from "expansion/scoutRequests"
import { stepOffEdge } from "./common/movement"
import ScoutHandler, { ScoutMemory } from "./scoutHandler"

/** A recon scout with no request for this long is done with: 50 energy isn't worth keeping it around for. */
const IDLE_TICKS = 300

/**
 * Goal: Scout a room the player asked for from the dashboard (see expansion/scoutRequests), now, rather than when
 * routine scouting gets round to it. A recon scout is a single MOVE part (ReconSpawnHandler spawns it ahead of
 * everything but emergency defence) that goes straight to the requested room, room by room the way scouts do (see
 * ScoutHandler), records it and reports back.
 *
 * Then it waits where it is for another request (it may be nearer the next one than home is), and after IDLE_TICKS
 * without one it's let go. Unlike routine scouts it keeps going with scouting switched off: the player asked.
 */
export default class ReconHandler extends ScoutHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory & { idleSince?: number }
    if (memory.requestRoom && !requestOpen(memory.requestRoom, creep)) delete memory.requestRoom
    if (memory.requestRoom) {
      delete memory.idleSince
      this.request(creep, memory, memory.requestRoom)
      return
    }
    memory.idleSince = memory.idleSince ?? Game.time
    if (IDLE_TICKS < Game.time - memory.idleSince) {
      creep.suicide()
      return
    }
    // Off the exit tiles meanwhile, where it would drift into the next room.
    stepOffEdge(creep)
  }
}
