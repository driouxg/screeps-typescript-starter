import { isHostile } from "config/relations"
import { isCombatant } from "defence/threat"

/**
 * Goal: Mine the sources of a base we've razed while its controller runs down (see conquest/conquest, claim phase),
 * which at the higher RCLs takes tens of thousands of ticks.
 *
 * A conquest marks its target razed (markRazed) once their towers and spawns are down. The room is mineable
 * (isRazedMineable) once it's been clear of fighters for SAFE_TICKS (watched while we can see it), and then:
 *   - RemotePlanner takes it like any other remote, except that its controller is owned, so it can't be reserved (its
 *     sources regenerate in full anyway: owned rooms' sources do) and nothing can be built there: no container (the
 *     miner drops what it mines, see RemoteMinerHandler) and no road. Haulers pick the energy up off the ground.
 *   - it no longer counts as a hostile room for paths (see utils/roomSafety), though its owner is still hostile.
 * It's dropped when its controller changes hands (free: it's an ordinary room again, or ours) or they rebuild a tower
 * or spawn; and it stops being mineable while fighters are about. Either way the remotes are re-planned straight away.
 */

const SAFE_TICKS = 300

export interface RazedRoom {
  /** Whose base it was (still owns the controller). */
  player: string
  since: number
  /** Since when no fighters have been seen in it. */
  clearSince?: number
  /** Whether it was mineable at the last check, to re-plan remotes when that changes. */
  safe?: boolean
}

declare global {
  interface Memory {
    /** Bases we razed whose controller someone else still owns (see remote/razed.ts). */
    razedRooms?: { [roomName: string]: RazedRoom }
  }
}

/** A conquest took down their towers and spawns. */
export function markRazed(room: string, player: string): void {
  if (Memory.razedRooms?.[room]) return
  Memory.razedRooms = { ...(Memory.razedRooms ?? {}), [room]: { player, since: Game.time } }
  console.log(`Razed ${room}: its sources can be remote mined once it's been clear for ${SAFE_TICKS} ticks`)
}

/** Whether a razed room can be mined now (see the top of this file). */
export function isRazedMineable(room: string): boolean {
  const r = Memory.razedRooms?.[room]
  return !!r && r.clearSince !== undefined && SAFE_TICKS <= Game.time - r.clearSince
}

/** Keep the razed rooms up to date, once a tick (see the top of this file). */
export function trackRazedRooms(): void {
  const razed = Memory.razedRooms
  if (!razed) return
  for (const [name, r] of Object.entries(razed)) {
    const intel = Memory.rooms[name]?.intel
    const owner = intel?.controller?.owner
    if (!intel || owner !== r.player) {
      drop(name, owner ? `now owned by ${owner}` : "its controller is free")
      continue
    }
    if (0 < intel.hostileStructures) {
      drop(name, `${r.player} rebuilt a tower or spawn there`)
      continue
    }

    const room = Game.rooms[name]
    if (room) {
      const fighters = room.find(FIND_HOSTILE_CREEPS, {
        filter: c => isCombatant(c) && (c.owner.username === r.player || isHostile(c))
      }).length
      if (fighters) delete r.clearSince
      else r.clearSince = r.clearSince ?? Game.time
    }

    const safe = isRazedMineable(name)
    if (safe !== !!r.safe) {
      r.safe = safe
      Memory.remotesReplan = true
      console.log(`Razed ${name}: ${safe ? "clear, remote mining it" : "fighters seen, not mining it for now"}`)
    }
  }
}

function drop(room: string, why: string): void {
  console.log(`Razed ${room}: ${why}; no longer mined as a razed base`)
  delete Memory.razedRooms![room]
  if (Object.values(Memory.remotes ?? {}).some(r => r.room === room)) Memory.remotesReplan = true
}
