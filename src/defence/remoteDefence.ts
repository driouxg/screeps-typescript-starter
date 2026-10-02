import { isHostile } from "config/relations"
import { defenderBody } from "creeps/spawn/meleeDefenderSpawnHandler"
import { creepDamage, isCombatant } from "./threat"

/**
 * Goal: Don't let a weak attacker shut down remote mining. When hostiles show up where our remote creeps work (a
 * remote room, or a room on the way to one), work out whether defenders the home room can build would win, and if so
 * how many: then spawn them (RemoteDefenderSpawnHandler) instead of abandoning the room for PAUSE_TICKS.
 *
 * A fight is modelled tick by tick at full strength: our defenders win if they'd kill all the hostiles' hits (against
 * the hostiles' healing) with a WIN_MARGIN of their own hits to spare against the hostiles' damage. Boosted hostiles
 * and invader cores aren't modelled: they count as unbeatable, and the room is paused as before.
 */

/** Most defenders sent to one room. */
export const MAX_REMOTE_DEFENDERS = 3
/** Our defenders must be able to take this many times as long as the fight should last. */
const WIN_MARGIN = 1.5
/** A threat in a room we've lost sight of is forgotten after this long (the defenders bring vision back sooner). */
const THREAT_STALE_TICKS = 1500
/**
 * A room counts as clear once it's been seen without hostiles this long: a raider chasing our retreating creeps
 * steps in and out across the exits, and clearing it at once kept recalling the defenders.
 */
const CLEAR_TICKS = 20

export interface RemoteThreat {
  home: string
  /** Defenders to send; 0 if we can't win (the room is paused instead). */
  defenders: number
  damage: number
  healing: number
  hits: number
  /** Last tick hostiles were seen there. */
  seen: number
  /** First tick of the current stretch it's been seen without hostiles (see CLEAR_TICKS). */
  clearSince?: number
}

declare global {
  interface Memory {
    /** Hostiles where our remote creeps work, by room (see defence/remoteDefence.ts). */
    remoteThreats?: { [roomName: string]: RemoteThreat }
  }
}

/** Hostile creeps in the room that fight or heal. */
export function hostileFighters(room: Room): Creep[] {
  return room.find(FIND_HOSTILE_CREEPS, {
    filter: c => isHostile(c) && (isCombatant(c) || 0 < c.getActiveBodyparts(HEAL))
  })
}

/**
 * Record (or clear) the threat in a room we can see, on behalf of the home whose remote creeps work there. Returns
 * the threat, or null if there's none.
 */
export function assessRemoteThreat(room: Room, home: Room): RemoteThreat | null {
  const threats = (Memory.remoteThreats = Memory.remoteThreats ?? {})
  const hostiles = hostileFighters(room)
  const core = room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_INVADER_CORE })
  if (hostiles.length <= 0 && core.length <= 0) {
    const threat = threats[room.name]
    if (!threat) return null
    threat.clearSince = threat.clearSince ?? Game.time
    if (CLEAR_TICKS <= Game.time - threat.clearSince) {
      console.log(`Remote ${room.name}: clear of hostiles`)
      delete threats[room.name]
      return null
    }
    return threat
  }

  const damage = hostiles.reduce((sum, c) => sum + creepDamage(c), 0)
  const healing = hostiles.reduce((sum, c) => sum + c.getActiveBodyparts(HEAL) * HEAL_POWER, 0)
  const hits = hostiles.reduce((sum, c) => sum + c.hits, 0)
  const boosted = hostiles.some(c => c.body.some(p => p.boost))
  const needed = core.length || boosted ? 0 : defendersToWin(home.energyCapacityAvailable, damage, healing, hits)
  // While the threat lasts, what it takes only goes up, and a group we can't beat stays unbeatable: raiders stepping
  // across an exit and back would otherwise change the count (and recall defenders) every other tick.
  const previous = threats[room.name]
  const defenders = !previous
    ? needed
    : previous.defenders === 0 || needed === 0
    ? 0
    : Math.max(previous.defenders, needed)

  const threat = { home: home.name, defenders, damage, healing, hits, seen: Game.time }
  if (!previous || previous.defenders !== defenders)
    console.log(
      `Remote ${room.name}: ${hostiles.length} hostiles (${damage} damage, ${healing} healing, ${hits} hits): ` +
        (defenders ? `sending ${defenders} defender(s) from ${home.name}` : "can't win, pausing")
    )
  threats[room.name] = threat
  return threat
}

/** Forget threats in rooms nobody has seen for THREAT_STALE_TICKS. */
export function forgetStaleThreats(): void {
  const threats = Memory.remoteThreats ?? {}
  for (const name in threats) if (THREAT_STALE_TICKS < Game.time - threats[name].seen) delete threats[name]
}

/**
 * Fewest defenders (built with `capacity` energy, see defenderBody) that beat hostiles dealing `damage` per tick,
 * healing `healing` and with `hits` in all; 0 if even MAX_REMOTE_DEFENDERS wouldn't.
 */
export function defendersToWin(capacity: number, damage: number, healing: number, hits: number): number {
  const body = defenderBody(capacity)
  const attack = body.filter(p => p === ATTACK).length * ATTACK_POWER
  if (attack <= 0) return 0
  for (let n = 1; n <= MAX_REMOTE_DEFENDERS; n++) {
    const net = n * attack - healing
    if (net <= 0) continue
    const fightTicks = hits / net
    const survivalTicks = damage <= 0 ? Infinity : (n * body.length * 100) / damage
    if (fightTicks * WIN_MARGIN <= survivalTicks) return n
  }
  return 0
}
