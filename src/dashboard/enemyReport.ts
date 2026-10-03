import { ENEMIES, isAlly } from "config/relations"
import { ourStrength, playerStrength, Strength } from "defence/strength"
import { relationOf } from "config/relations"
import {
  AggressionSnapshot,
  ContestCandidateSnapshot,
  ContestSnapshot,
  EnemySnapshot,
  StrengthSnapshot
} from "./snapshot"

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

/** Contests underway, and the rooms the planner could contest (see remote/contest), for the remote mining card. */
export function contestReports(): { contests: ContestSnapshot[]; contestCandidates: ContestCandidateSnapshot[] } {
  const contests = Object.entries(Memory.remoteContests ?? {}).map(([room, c]) => ({
    room,
    player: c.player,
    home: c.home,
    status: c.status,
    started: c.started,
    manual: !!c.manual
  }))
  const strengths = new Map<string, StrengthSnapshot | null>()
  const strengthOf = (player: string) => {
    if (!strengths.has(player)) {
      const s = playerStrength(player)
      strengths.set(player, s ? snapshotOf(s) : null)
    }
    return strengths.get(player)!
  }
  const contestCandidates = Object.entries(Memory.contestCandidates ?? {}).map(([room, c]) => ({
    room,
    player: c.player,
    home: c.home,
    verdict: c.verdict,
    ally: isAlly(c.player),
    strength: strengthOf(c.player),
    tick: c.tick
  }))
  return { contests, contestCandidates }
}

/**
 * Players listed in the aggression report (flagged ones first, then the most recent), and incidents each: the snapshot
 * shares its memory segment's 100 KB with everything else.
 */
const AGGRESSION_PLAYERS = 12
const AGGRESSION_INCIDENTS = 8

/**
 * What each player did to us (see defence/aggressionLog), with the bot's reading of whether it was real aggression:
 *   bad   they attacked us in our own rooms without us having started it;
 *   warn  they attacked us in rooms that are neither ours nor theirs (a fight over a remote, a roaming army), or we
 *         have no incidents on record (flagged before logging began, by a conquest, or from the console);
 *   good  every attack came after we hit them, or was them defending their own base or remotes.
 */
export function aggressionReports(): AggressionSnapshot[] {
  const flagged = Memory.hostilePlayers ?? {}
  const log = Memory.aggressionLog ?? {}
  const players = [...new Set([...Object.keys(log), ...Object.keys(flagged)])]
  return players
    .map(player => {
      const record = log[player]
      const incidents = record?.incidents ?? []
      const count = (zone: string) => incidents.filter(i => i.zone === zone).length
      const unprovokedOurs = incidents.filter(i => i.zone === "ours" && !i.provoked).length
      const unprovokedElsewhere = incidents.filter(i => i.zone === "elsewhere" && !i.provoked).length
      const killed = record?.killed ?? 0
      let verdict: AggressionSnapshot["verdict"]
      if (incidents.length === 0)
        verdict = {
          tone: "warn",
          text: record?.flaggedFor
            ? `No attacks on us on record: flagged because ${record.flaggedFor}.`
            : "No attacks on us on record: flagged before incidents were logged, or from the console."
        }
      else if (unprovokedOurs)
        verdict = {
          tone: "bad",
          text: `Attacked us in our own rooms without us starting it (${unprovokedOurs} incident${
            unprovokedOurs === 1 ? "" : "s"
          }${killed ? `, ${killed} of ours killed` : ""}): a real threat.`
        }
      else if (unprovokedElsewhere)
        verdict = {
          tone: "warn",
          text: `Attacked us in rooms that are neither ours nor theirs (${unprovokedElsewhere}): maybe a fight over a remote, or an army passing through.`
        }
      else
        verdict = {
          tone: "good",
          text: "Every attack came after we hit them first, or was them defending their own base or remotes: likely safe to forgive."
        }
      return {
        player,
        relation: relationOf(player),
        flagged: flagged[player],
        flaggedFor: record?.flaggedFor,
        first: record?.first ?? flagged[player] ?? Game.time,
        last: record?.last ?? flagged[player] ?? Game.time,
        damage: record?.damage ?? 0,
        killed,
        hits: record?.hits ?? 0,
        inOurs: count("ours"),
        inTheirs: count("theirs"),
        elsewhere: count("elsewhere"),
        unprovokedOurs,
        verdict,
        incidents: incidents.slice(0, AGGRESSION_INCIDENTS)
      }
    })
    .sort((a, b) => Number(b.flagged !== undefined) - Number(a.flagged !== undefined) || b.last - a.last)
    .slice(0, AGGRESSION_PLAYERS)
}

function snapshotOf(s: Strength): StrengthSnapshot {
  return { score: Math.round(s.score), bases: s.bases, towers: s.towers, stored: Math.round(s.stored), army: s.army }
}
