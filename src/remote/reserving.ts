/**
 * Goal: Know which base keeps a remote room reserved. A reservation needs a reserver with at least 2 CLAIM parts (one
 * only makes up for the reservation's own decay), so 1300 energy with their MOVE: a base that can't afford that (below
 * RCL 4) would lose its reserved remotes to the first player who reserves them. So the remote's own base reserves it
 * if it can, otherwise the nearest base that can, within RESERVER_MAX_ROUTE rooms (see RemoteSpawnHandler, and the
 * contests' reservers in remote/contest).
 */

export const RESERVER_BODY: BodyPartConstant[] = [CLAIM, CLAIM, MOVE, MOVE]
export const RESERVER_COST = RESERVER_BODY.reduce((sum, p) => sum + BODYPART_COST[p], 0)
/** How far a base sends reservers for a weaker base's remotes. */
export const RESERVER_MAX_ROUTE = 3

let cache: { tick: number; bases: Map<string, string | null> } = { tick: -1, bases: new Map() }

/**
 * The base that reserves `room` for the remote base `home`: `home` if it can afford RESERVER_COST, otherwise the
 * nearest base that can within RESERVER_MAX_ROUTE rooms of `room`; null if none can. Cached per tick.
 */
export function reservingBase(room: string, home: string): string | null {
  if (cache.tick !== Game.time) cache = { tick: Game.time, bases: new Map() }
  const key = `${room}<${home}`
  if (cache.bases.has(key)) return cache.bases.get(key)!

  const can = (r: Room | undefined) =>
    !!r?.controller?.my && RESERVER_COST <= r.energyCapacityAvailable && 0 < r.find(FIND_MY_SPAWNS).length
  let base: string | null = null
  if (can(Game.rooms[home])) base = home
  else {
    let best = Infinity
    for (const r of Object.values(Game.rooms)) {
      if (!can(r)) continue
      const route = Game.map.findRoute(r.name, room)
      if (route === ERR_NO_PATH || RESERVER_MAX_ROUTE < route.length || best <= route.length) continue
      best = route.length
      base = r.name
    }
  }
  cache.bases.set(key, base)
  return base
}
