import { relationOf } from "config/relations"
import * as creepRoles from "creeps/roles"
import { isHostileRoom, sameMapZone } from "utils/roomSafety"

/**
 * Goal: Hit back at a player who attacked us, once, where it costs them and not us (requested from the dashboard:
 * Memory.retaliation). One strike at a time.
 *
 * 1. planning: find the player's weak spot from what we know of their rooms (intel), within MAX_ROUTE rooms of one
 *    of our bases with an RCL of at least MIN_RCL:
 *      - a room they reserve (remote mining): no towers, just their miners, haulers and containers;
 *      - a base whose towers are missing or out of energy, and that isn't in safe mode.
 *    Their remotes come first (they can't defend them), then bases, nearest first. If there's no weak spot the
 *    strike is called off: nothing is sent where towers would just kill it.
 * 2. spawning: the home spawns the squad (see RetaliationSpawnHandler): attackers and a healer. It waits at home.
 * 3. attacking: the squad goes in and destroys the player's creeps and structures there (see RetaliatorHandler).
 *    If it finds working towers or safe mode on arrival, it turns back.
 * Then it's over (done, failed or called off): the squad goes home and joins the home's defenders.
 *
 * Forgiving the player (or calling it off from the dashboard) ends it too.
 */

/** How far (in rooms, from one of our bases) a strike goes. */
const MAX_ROUTE = 6
/** Our base needs this RCL (energy capacity) to send a squad worth sending. */
const MIN_RCL = 4
/** Towers with less energy than this between them can't shoot for long. */
const TOWER_ENERGY_MIN = 100
/** Intel older than this isn't trusted for a base (towers get refilled); remotes change less. */
const BASE_INTEL_TICKS = 5000
const REMOTE_INTEL_TICKS = 20000
/** Squad size: against a remote, and against a base. */
const REMOTE_SQUAD = { attackers: 2, healers: 1 }
const BASE_SQUAD = { attackers: 3, healers: 1 }
/** Give up if the squad isn't spawned in this long, or the whole strike takes longer than this. */
const SPAWN_TIMEOUT = 2000
const STRIKE_TIMEOUT = 4000

export type RetaliationState = "planning" | "spawning" | "attacking" | "over"

export interface Retaliation {
  player: string
  /** When it was asked for (ms since epoch, from the dashboard). */
  requested: number
  state?: RetaliationState
  /** What's happening, or how it ended, for the dashboard. */
  status?: string
  target?: string
  home?: string
  kind?: "remote" | "base"
  attackers?: number
  healers?: number
  /** Ticks it started spawning, and attacking. */
  started?: number
  attackStarted?: number
}

declare global {
  interface Memory {
    /** The strike on a player who attacked us (see defence/retaliation.ts), or null/absent for none. */
    retaliation?: Retaliation | null
  }
}

export function retaliation(): Retaliation | null {
  return Memory.retaliation ?? null
}

/** Creeps of the current strike's squad. */
export function squad(): Creep[] {
  return Object.values(Game.creeps).filter(c => c.memory.role === creepRoles.RETALIATOR)
}

/** Advance the strike, once a tick. */
export function runRetaliation(): void {
  const r = Memory.retaliation
  if (!r || r.state === "over") return

  if (relationOf(r.player) !== "hostile") return end(r, `called off: ${r.player} isn't hostile any more`)
  if (!r.state || r.state === "planning") return plan(r)

  if (r.state === "spawning") {
    const members = squad()
    if ((r.attackers ?? 0) + (r.healers ?? 0) <= members.filter(c => !c.spawning).length) {
      r.state = "attacking"
      r.attackStarted = Game.time
      r.status = `squad of ${members.length} on its way to ${r.target}`
      return
    }
    if (SPAWN_TIMEOUT < Game.time - (r.started ?? Game.time)) end(r, "failed: the squad took too long to spawn")
    return
  }

  // attacking
  const attackers = squad().filter(c => (c.memory as { kind?: string }).kind === "attacker")
  if (attackers.length <= 0) return end(r, `failed: squad lost in ${r.target}`)
  if (STRIKE_TIMEOUT < Game.time - (r.started ?? Game.time)) end(r, "over: took too long")
}

/** End the strike; the squad sees it and goes home (see RetaliatorHandler). */
export function end(r: Retaliation, status: string): void {
  if (r.state !== "over") console.log(`Retaliation on ${r.player}: ${status}`)
  r.state = "over"
  r.status = status
}

function plan(r: Retaliation): void {
  const homes = Object.values(Game.rooms).filter(room => room.controller?.my && MIN_RCL <= room.controller.level)
  if (homes.length <= 0) return end(r, `called off: no base of ours is RCL ${MIN_RCL} yet`)

  let best: { target: string; home: Room; kind: "remote" | "base"; distance: number } | null = null
  let towersEverywhere = false
  for (const [name, memory] of Object.entries(Memory.rooms ?? {})) {
    const intel = memory.intel
    if (!intel?.controller) continue
    const owned = intel.controller.owner === r.player
    const reserved = !owned && intel.controller.reservedBy === r.player
    if (!owned && !reserved) continue

    const age = Game.time - intel.tick
    let kind: "remote" | "base"
    if (reserved) {
      if (REMOTE_INTEL_TICKS < age) continue
      kind = "remote"
    } else {
      if (BASE_INTEL_TICKS < age) continue
      const armed = 0 < (intel.towers ?? 0) && TOWER_ENERGY_MIN <= (intel.towerEnergy ?? 0)
      const safe = Game.time < (intel.safeModeUntil ?? 0)
      if (armed || safe) {
        towersEverywhere = true
        continue
      }
      kind = "base"
    }

    for (const home of homes) {
      if (!sameMapZone(home.name, name)) continue
      const distance = routeLength(home.name, name)
      if (distance === null || MAX_ROUTE < distance) continue
      const better =
        !best ||
        (kind === "remote" && best.kind === "base") ||
        (kind === best.kind &&
          (distance < best.distance ||
            (distance === best.distance && best.home.energyCapacityAvailable < home.energyCapacityAvailable)))
      if (better) best = { target: name, home, kind, distance }
    }
  }

  if (!best)
    return end(
      r,
      towersEverywhere
        ? `called off: every room of ${r.player}'s we know of has working towers or safe mode`
        : `called off: we know of no room of ${r.player}'s within ${MAX_ROUTE} rooms (scouts may find one later)`
    )

  const size = best.kind === "remote" ? REMOTE_SQUAD : BASE_SQUAD
  Object.assign(r, {
    state: "spawning",
    target: best.target,
    home: best.home.name,
    kind: best.kind,
    attackers: size.attackers,
    healers: size.healers,
    started: Game.time,
    status: `spawning ${size.attackers} attackers and ${size.healers} healer in ${best.home.name} for their ${
      best.kind === "remote" ? "remote" : "base"
    } ${best.target}`
  })
  console.log(`Retaliation on ${r.player}: ${r.status}`)
}

/** Rooms from `from` to `to`, avoiding hostile rooms on the way; null if there's no way. */
function routeLength(from: string, to: string): number | null {
  const route = Game.map.findRoute(from, to, {
    routeCallback: name => (name !== to && isHostileRoom(name) ? Infinity : 1)
  })
  return route === ERR_NO_PATH ? null : route.length
}
