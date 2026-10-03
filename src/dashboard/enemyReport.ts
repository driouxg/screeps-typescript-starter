import { ENEMIES, isAlly } from "config/relations"
import { ourStrength, playerStrength, Strength } from "defence/strength"
import { relationOf } from "config/relations"
import { SUPPORT_ROUTE } from "conquest/assessment"
import {
  attackPower,
  BaseDefence,
  baseDefence,
  BaseInfo,
  baseInfoAt,
  FightPrediction,
  ourBaseDefence,
  ourBaseInfo,
  predictFight
} from "defence/power"
import { myUsername } from "utils/username"
import {
  AggressionSnapshot,
  BaseDefenceSnapshot,
  FightPredictionSnapshot,
  ContestCandidateSnapshot,
  ContestSnapshot,
  EnemySnapshot,
  StrengthSnapshot
} from "./snapshot"

/** Their bases seen within this long count towards their attack and defences. */
const POWER_INTEL_TICKS = 20000

/** A fight prediction for the snapshot; null prediction: the attackers can't build a squad at all. */
function prediction(room: string, rooms: number, p: FightPrediction | null): FightPredictionSnapshot {
  return p
    ? { room, rooms, ...p }
    : { room, rooms, attackerWins: false, margin: 0, ticks: null, limit: "can't build a squad (RCL 3 needed)" }
}

/** Rooms listed per enemy, most recently seen first. */
const ROOMS_PER_ENEMY = 12

/**
 * Goal: What we know about each player we treat as hostile (flagged for attacking us, or declared an enemy), for the
 * dashboard's enemy report: their strength next to ours (see defence/strength) and every room of theirs we've seen.
 */
export function enemyReports(): {
  ours: StrengthSnapshot
  enemies: EnemySnapshot[]
  ourAttack: ReturnType<typeof attackPower>
  ourDefences: BaseDefenceSnapshot[]
} {
  const flagged = Memory.hostilePlayers ?? {}
  const me = myUsername()
  const ourBases = Object.values(Game.rooms).filter(r => r.controller?.my && 0 < r.find(FIND_MY_SPAWNS).length)
  const ourInfo = new Map(ourBases.map(r => [r.name, ourBaseInfo(r)]))
  const ourArmy = (rooms: string[]) =>
    Object.values(Game.creeps)
      .filter(c => rooms.includes(c.memory.room))
      .reduce((sum, c) => sum + c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) + c.getActiveBodyparts(HEAL), 0)
  const ourDefences = new Map(ourBases.map(r => [r.name, ourBaseDefence(r)]))
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

    // Attack and defence (see defence/power), and who'd win each way.
    const theirBases: { info: BaseInfo; defence: BaseDefence }[] = []
    for (const [name, memory] of Object.entries(Memory.rooms ?? {})) {
      const intel = memory.intel
      if (!intel || intel.controller?.owner !== player || POWER_INTEL_TICKS < Game.time - intel.tick) continue
      const siege = memory.siege && memory.siege.owner === player ? memory.siege : undefined
      const info = baseInfoAt(name, intel.controller.level, intel.storedEnergy ?? 0, siege?.spawns.length)
      theirBases.push({
        info,
        defence: baseDefence(name, info, player, siege, {
          towers: intel.towers ?? 0,
          towerEnergy: intel.towerEnergy ?? 0,
          sources: intel.sources,
          defenderParts: intel.combatParts?.[player] ?? 0,
          safeModes: intel.safeModeAvailable ?? 0,
          safeModeActive: !!intel.safeModeUntil && Game.time < intel.safeModeUntil
        })
      })
    }
    const attack = attackPower(theirBases.map(b => b.info), combatParts)
    const near = (from: string[], to: string) => from.filter(r => Game.map.getRoomLinearDistance(r, to) <= SUPPORT_ROUTE)
    const closest = (from: string[], to: string) => Math.min(...from.map(r => Game.map.getRoomLinearDistance(r, to)))
    const ourAttack: FightPredictionSnapshot[] = theirBases.map(({ defence }) => {
      const helpers = near([...ourInfo.keys()], defence.room)
      const from = helpers.length ? helpers : [...ourInfo.keys()]
      const ours = attackPower(from.map(r => ourInfo.get(r)!), ourArmy(from))
      return prediction(defence.room, closest(from, defence.room), ours ? predictFight(ours, defence, closest(from, defence.room)) : null)
    })
    const theirAttack: FightPredictionSnapshot[] = [...ourDefences.values()].map(defence => {
      const from = near(theirBases.map(b => b.info.room), defence.room)
      if (!from.length)
        return { room: defence.room, rooms: 0, attackerWins: false, margin: 0, ticks: null, limit: `none of their bases is within ${SUPPORT_ROUTE} rooms` }
      const theirs = attackPower(theirBases.filter(b => from.includes(b.info.room)).map(b => b.info), combatParts)
      return prediction(defence.room, closest(from, defence.room), theirs ? predictFight(theirs, defence, closest(from, defence.room)) : null)
    })
    return {
      player,
      flaggedSince: flagged[player],
      declared: declared.has(player),
      strength: strength ? snapshotOf(strength) : null,
      combatParts,
      lastSeen: lastSeen || undefined,
      rooms: rooms.slice(0, ROOMS_PER_ENEMY),
      attack,
      defences: theirBases.map(b => b.defence),
      ourAttack,
      theirAttack
    }
  })
  return {
    ours: snapshotOf(ourStrength()),
    enemies,
    ourAttack: attackPower([...ourInfo.values()], ourArmy([...ourInfo.keys()])),
    ourDefences: [...ourDefences.values()].map(d => ({ ...d, owner: me ?? d.owner }))
  }
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
