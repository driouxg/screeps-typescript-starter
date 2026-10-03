import * as creepRoles from "creeps/roles"
import { isHostileRoom } from "utils/roomSafety"

/**
 * Goal: Scout a room the player asked for (from the dashboard: Memory.scoutRequests), from whichever of our bases is
 * closest to it.
 *
 * For each request, once a tick:
 *   1. pick the base with a spawn that's the fewest rooms away by a route around hostile rooms (MAX_ROUTE at most),
 *      the bigger one on ties;
 *   2. give the request to a recon scout of that base that isn't on one already, or have the base spawn one (see
 *      ReconSpawnHandler: ahead of everything but defence). Routine scouts aren't used: one wandering rooms away in
 *      the wrong direction made the player wait;
 *   3. the recon scout goes straight there (see ReconHandler), records the room and reports back
 *      (completeScoutRequest).
 * A request not done within TIMEOUT_TICKS of being taken on has failed. Finished ones stay listed for SHOW_TICKS so
 * the dashboard can say how they went.
 */

const MAX_ROUTE = 20
const TIMEOUT_TICKS = 3000
const SHOW_TICKS = 1500

export interface ScoutRequest {
  /** When it was asked for (ms since epoch, from the dashboard). */
  requested: number
  /** The base sending the scout, and when it took the request on. */
  home?: string
  since?: number
  /** The scout on it. */
  scout?: string
  /** What's happening, or how it went. */
  status?: string
  /** Tick it was done or failed. */
  done?: number
}

declare global {
  interface Memory {
    /** Rooms the player asked to scout (see expansion/scoutRequests.ts); null entries are cancelled. */
    scoutRequests?: { [roomName: string]: ScoutRequest | null }
  }
}

export function runScoutRequests(): void {
  const requests = Memory.scoutRequests
  if (!requests) return
  for (const [room, request] of Object.entries(requests)) {
    if (!request || (request.done && SHOW_TICKS < Game.time - request.done)) {
      delete requests[room]
      continue
    }
    if (request.done) continue
    if (!request.home) {
      assignHome(room, request)
      continue
    }
    if (TIMEOUT_TICKS < Game.time - (request.since ?? Game.time)) {
      finish(request, `failed: no scout got there in ${TIMEOUT_TICKS} ticks`)
      continue
    }
    if (request.scout && !Game.creeps[request.scout]) {
      delete request.scout
      request.status = `scout lost; sending another from ${request.home}`
    }
    if (!request.scout) assignScout(room, request)
  }
  if (Object.keys(requests).length <= 0) delete Memory.scoutRequests
}

/** A requested room the base `home` needs a new scout for: none of its scouts is free to take it. */
export function scoutNeededFor(home: string): string | null {
  for (const [room, request] of Object.entries(Memory.scoutRequests ?? {}))
    if (request && !request.done && request.home === home && !request.scout) return room
  return null
}

/** Whether a scout's requested room still wants scouting (not done, cancelled or given to another scout). */
export function requestOpen(room: string, scout: Creep): boolean {
  const request = Memory.scoutRequests?.[room]
  return !!request && !request.done && (!request.scout || request.scout === scout.name)
}

/** The scout reached the requested room and recorded it. */
export function completeScoutRequest(room: string): void {
  const request = Memory.scoutRequests?.[room]
  if (request && !request.done) finish(request, `scouted at tick ${Game.time}`)
}

function assignHome(room: string, request: ScoutRequest): void {
  let best: { home: Room; distance: number } | null = null
  for (const home of Object.values(Game.rooms)) {
    if (!home.controller?.my || home.find(FIND_MY_SPAWNS).length <= 0) continue
    const distance = home.name === room ? 0 : routeLength(home.name, room)
    if (distance === null || MAX_ROUTE < distance) continue
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && best.home.energyCapacityAvailable < home.energyCapacityAvailable)
    )
      best = { home, distance }
  }
  if (!best) return finish(request, `failed: no base of ours within ${MAX_ROUTE} rooms of it`)
  request.home = best.home.name
  request.since = Game.time
  request.status = `sending a scout from ${best.home.name} (${best.distance} room${best.distance === 1 ? "" : "s"} away)`
  console.log(`Scout request ${room}: ${request.status}`)
}

/** A recon scout of the home that isn't on another request takes it; otherwise the home spawns one. */
function assignScout(room: string, request: ScoutRequest): void {
  const scouts = Object.values(Game.creeps).filter(
    c => c.memory.role === creepRoles.RECON && c.memory.room === request.home
  )
  // One already sent for it (just spawned for this request), else a free one.
  const scout =
    scouts.find(c => (c.memory as { requestRoom?: string }).requestRoom === room) ??
    scouts.find(c => !(c.memory as { requestRoom?: string }).requestRoom)
  if (!scout) {
    request.status = `spawning a recon scout in ${request.home}`
    return
  }
  ;(scout.memory as { requestRoom?: string }).requestRoom = room
  request.scout = scout.name
  request.status = `recon scout from ${request.home} on its way`
}

function finish(request: ScoutRequest, status: string): void {
  request.status = status
  request.done = Game.time
}

/** Rooms from `from` to `to`, around hostile rooms (the target itself may be one); null if there's no way. */
function routeLength(from: string, to: string): number | null {
  const route = Game.map.findRoute(from, to, {
    routeCallback: name => (name !== to && isHostileRoom(name) ? Infinity : 1)
  })
  return route === ERR_NO_PATH ? null : route.length
}
