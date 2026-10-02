import { ENEMIES } from "config/relations"
import { ourStrength, playerStrength, Strength } from "defence/strength"
import { EnemySnapshot, StrengthSnapshot } from "./snapshot"

/** Rooms listed per enemy, most recently seen first. */
const ROOMS_PER_ENEMY = 12

/**
 * Goal: What we know about each player we treat as hostile (flagged for attacking us, or declared an enemy), for the
 * dashboard's enemy report: their strength next to ours (see defence/strength) and every room of theirs we've seen.
 */
export function enemyReports(): { ours: StrengthSnapshot; enemies: EnemySnapshot[] } {
  const flagged = Memory.hostilePlayers ?? {}
  const declared = new Set([...ENEMIES, ...(Memory.enemies ?? [])])
  const players = [...new Set([...Object.keys(flagged), ...declared])].sort()

  const enemies = players.map(player => {
    let combatParts = 0
    let lastSeen = 0
    const rooms: EnemySnapshot["rooms"] = []
    for (const [name, memory] of Object.entries(Memory.rooms ?? {})) {
      const intel = memory.intel
      if (!intel) continue
      const parts = intel.combatParts?.[player] ?? 0
      combatParts = Math.max(combatParts, parts)
      const owned = intel.controller?.owner === player
      const reserved = intel.controller?.reservedBy === player
      if (!owned && !reserved && parts <= 0) continue
      lastSeen = Math.max(lastSeen, intel.tick)
      rooms.push({
        room: name,
        kind: owned ? "base" : reserved ? "remote" : "army seen",
        rcl: owned ? intel.controller?.level : undefined,
        towers: owned ? intel.towers ?? 0 : undefined,
        towerEnergy: owned ? intel.towerEnergy ?? 0 : undefined,
        safeModeUntil: owned && intel.safeModeUntil && Game.time < intel.safeModeUntil ? intel.safeModeUntil : undefined,
        safeModeAvailable: owned ? intel.safeModeAvailable : undefined,
        stored: owned ? intel.storedEnergy : undefined,
        combatParts: parts || undefined,
        seen: intel.tick
      })
    }
    rooms.sort((a, b) => (a.kind === "base" ? 0 : 1) - (b.kind === "base" ? 0 : 1) || b.seen - a.seen)
    const strength = playerStrength(player)
    return {
      player,
      flaggedSince: flagged[player],
      declared: declared.has(player),
      strength: strength ? snapshotOf(strength) : null,
      combatParts,
      lastSeen: lastSeen || undefined,
      rooms: rooms.slice(0, ROOMS_PER_ENEMY)
    }
  })
  return { ours: snapshotOf(ourStrength()), enemies }
}

function snapshotOf(s: Strength): StrengthSnapshot {
  return { score: Math.round(s.score), bases: s.bases, towers: s.towers, stored: Math.round(s.stored), army: s.army }
}
