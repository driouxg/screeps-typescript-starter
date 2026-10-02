/**
 * Goal: Tear down a base the player decided was a mistake (Memory.abandonRooms, set from the dashboard), freeing its
 * GCL level for a better room.
 *
 * For each requested room, every tick until it's done:
 *   1. stop what serves it: its creeps (suicide), its remotes and highway, an expansion it sends or is the target of;
 *   2. destroy its structures and construction sites (hostile creeps in the room block destroying: it waits);
 *   3. the tick after, once nothing is left, unclaim the controller.
 * The room is then blacklisted for expansion for ABANDONED_BLACKLIST_TICKS, and only its intel is kept in memory.
 * Our only room is never abandoned: that would end the game.
 */

/** Long enough that the planner doesn't take the room straight back; the player can still pick it from the dashboard. */
const ABANDONED_BLACKLIST_TICKS = 200000

export interface AbandonRequest {
  /** When it was asked for (ms since epoch, from the dashboard). */
  requested: number
  /** Progress, written by the bot. */
  status?: string
}

declare global {
  interface Memory {
    /** Bases to tear down (see abandonBase); null entries are cancelled requests. */
    abandonRooms?: { [roomName: string]: AbandonRequest | null }
  }
}

export function abandonBases(): void {
  const requests = Memory.abandonRooms
  if (!requests) return
  for (const [name, request] of Object.entries(requests)) {
    if (!request) {
      delete requests[name]
      continue
    }
    const status = abandon(name)
    if (status === null) delete requests[name]
    else if (request.status !== status) {
      console.log(`Abandoning ${name}: ${status}`)
      request.status = status
    }
  }
  if (Object.keys(requests).length <= 0) delete Memory.abandonRooms
}

/** One tick's work on abandoning a room: what it's waiting for, or null once it's done. */
function abandon(name: string): string | null {
  const room = Game.rooms[name]
  if (!room?.controller?.my) {
    forget(name)
    return null
  }
  const owned = Object.values(Game.rooms).filter(r => r.controller?.my).length
  if (owned <= 1) return "refused: it's our only room"

  const expansion = Memory.expansion
  if (expansion && (expansion.home === name || expansion.target === name)) delete Memory.expansion
  for (const [id, remote] of Object.entries(Memory.remotes ?? {})) if (remote.home === name) delete Memory.remotes![id]
  if (Memory.highways) delete Memory.highways[name]
  for (const creep of Object.values(Game.creeps)) if (creep.memory.room === name) creep.suicide()
  for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) site.remove()

  const structures = room.find(FIND_STRUCTURES, {
    filter: s => s.structureType !== STRUCTURE_CONTROLLER && (!("owner" in s) || (s as OwnedStructure).my)
  })
  if (0 < structures.length) {
    const busy = structures.map(s => s.destroy()).some(code => code === ERR_BUSY)
    return busy ? "waiting: hostile creeps in the room stop us destroying structures" : "destroying structures"
  }

  room.controller.unclaim()
  Memory.expansionBlacklist = Memory.expansionBlacklist ?? {}
  Memory.expansionBlacklist[name] = Game.time + ABANDONED_BLACKLIST_TICKS
  forget(name)
  console.log(`Abandoned ${name}`)
  return null
}

/** Drop everything we kept about running the room; what we know of it (intel) stays. */
function forget(name: string): void {
  const intel = Memory.rooms[name]?.intel
  if (intel) Memory.rooms[name] = { intel } as RoomMemory
  else delete Memory.rooms[name]
}
