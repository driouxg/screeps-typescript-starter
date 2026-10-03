import { myUsername } from "utils/username"

/**
 * Goal: Remember what each player did to us, where, and whether we started it, so the player (on the dashboard) can
 * judge whether someone flagged hostile for attacking us is a real threat or should be forgiven (see config/relations).
 *
 * Every attack on one of our creeps, structures or controller seen in the rooms' event logs (see recordAggression)
 * becomes an incident: the room and whose it is (our base or remote, theirs, someone else's, unclaimed), the attacker
 * (a tower, or a creep and its body), what it hit (our creep's role, the structure), how (melee, ranged, dismantle,
 * the automatic hit back of a creep we hit in melee, ...), the damage, and whether it was a killing blow. Repeats of
 * the same attack (a tower firing at the same creep tick after tick) within MERGE_TICKS are added up into one
 * incident. MAX_INCIDENTS are kept per player, newest first, with running totals.
 *
 * Context that makes an attack look less like aggression is noted with it (provoked): we attacked that player within
 * PROVOKED_TICKS before (our attacks on other players are remembered too), or our creep was in their base or remote.
 */

const MERGE_TICKS = 100
const MAX_INCIDENTS = 15
const PROVOKED_TICKS = 1500
/** Players not seen attacking us for this long are forgotten (unless still flagged). */
const FORGET_TICKS = 200000

export type Zone = "ours" | "theirs" | "elsewhere"

export interface AggressionIncident {
  /** First and last tick of this incident. */
  tick: number
  lastTick: number
  room: string
  /** Whose room it is, in words ("our base", "their remote", "Bob's base", "unclaimed room"), and which side. */
  where: string
  zone: Zone
  /** "tower", or "creep: 4 ATTACK, 4 MOVE". */
  attacker: string
  /** "our REMOTE_MINER", "our spawn", "our controller". */
  target: string
  /** melee, ranged, mass ranged, dismantle, hit back, controller attack, nuke. */
  how: string
  damage: number
  /** Hits counted (ticks of fire, attackers). */
  hits: number
  /** Our creeps or structures it destroyed. */
  killed: number
  /** Why it may not have been aggression on their part. */
  provoked?: string
}

export interface AggressionRecord {
  first: number
  last: number
  damage: number
  killed: number
  hits: number
  /** What got them flagged hostile, in words. */
  flaggedFor?: string
  incidents: AggressionIncident[]
}

declare global {
  interface Memory {
    /** What each player has done to us (see defence/aggressionLog.ts). */
    aggressionLog?: { [player: string]: AggressionRecord }
    /** Our last attack on each player's creeps or structures: provocation, when they hit back. */
    ourAttacks?: { [player: string]: { tick: number; room: string; what: string } }
  }
}

/** An incident to log (before merging), from an event (see recordAggression). */
export type NewIncident = Omit<AggressionIncident, "lastTick" | "zone" | "where" | "provoked"> & { roomObject: Room }

/** Log an attack on us by `player`; returns the incident it was merged into or added as. */
export function logIncident(player: string, incident: NewIncident): AggressionIncident {
  const log = (Memory.aggressionLog = Memory.aggressionLog ?? {})
  const record = (log[player] = log[player] ?? {
    first: Game.time,
    last: Game.time,
    damage: 0,
    killed: 0,
    hits: 0,
    incidents: []
  })
  record.last = Game.time
  record.damage += incident.damage
  record.killed += incident.killed
  record.hits += incident.hits

  const { where, zone } = whereOf(incident.roomObject, player)
  const provoked = provocation(player, zone, where, incident.target)
  const same = record.incidents.find(
    i =>
      i.room === incident.room &&
      i.attacker === incident.attacker &&
      i.target === incident.target &&
      i.how === incident.how &&
      Game.time - i.lastTick <= MERGE_TICKS
  )
  if (same) {
    same.lastTick = Game.time
    same.damage += incident.damage
    same.hits += incident.hits
    same.killed += incident.killed
    same.provoked = same.provoked ?? provoked
    return same
  }
  const added: AggressionIncident = {
    tick: incident.tick,
    lastTick: incident.tick,
    room: incident.room,
    where,
    zone,
    attacker: incident.attacker,
    target: incident.target,
    how: incident.how,
    damage: incident.damage,
    hits: incident.hits,
    killed: incident.killed,
    ...(provoked ? { provoked } : {})
  }
  record.incidents.unshift(added)
  record.incidents.splice(MAX_INCIDENTS)
  return added
}

/** Remember that we attacked `player` (their creep or structure). */
export function logOurAttack(player: string, room: string, what: string): void {
  Memory.ourAttacks = { ...(Memory.ourAttacks ?? {}), [player]: { tick: Game.time, room, what } }
}

/** Say why a player was flagged hostile (the incident, a conquest approved, ...), unless already said. */
export function noteFlagged(player: string, why: string): void {
  const log = (Memory.aggressionLog = Memory.aggressionLog ?? {})
  const record = (log[player] = log[player] ?? {
    first: Game.time,
    last: Game.time,
    damage: 0,
    killed: 0,
    hits: 0,
    incidents: []
  })
  record.flaggedFor = why
}

/** Drop players not seen for FORGET_TICKS who aren't flagged any more. Cheap; run now and then. */
export function forgetOldAggression(): void {
  const log = Memory.aggressionLog
  if (!log) return
  for (const [player, record] of Object.entries(log))
    if (FORGET_TICKS < Game.time - record.last && Memory.hostilePlayers?.[player] === undefined) delete log[player]
  for (const [player, attack] of Object.entries(Memory.ourAttacks ?? {}))
    if (FORGET_TICKS < Game.time - attack.tick) delete Memory.ourAttacks![player]
}

/** Whose room `room` is, as seen from `player` attacking us there. */
function whereOf(room: Room, player: string): { where: string; zone: Zone } {
  const me = myUsername()
  const controller = room.controller
  const owner = controller?.owner?.username
  const reserver = controller?.reservation?.username
  if (controller?.my) return { where: "our base", zone: "ours" }
  if ((reserver && reserver === me) || Object.values(Memory.remotes ?? {}).some(r => r.room === room.name))
    return { where: "our remote", zone: "ours" }
  if (owner === player) return { where: "their base", zone: "theirs" }
  if (reserver === player) return { where: "their remote", zone: "theirs" }
  if (owner) return { where: `${owner}'s base`, zone: "elsewhere" }
  if (reserver) return { where: `${reserver}'s remote`, zone: "elsewhere" }
  if (!controller) return { where: "a highway or keeper room", zone: "elsewhere" }
  return { where: "an unclaimed room", zone: "elsewhere" }
}

/** Why an attack may not have been aggression: we hit them first lately, or we were in their rooms. */
function provocation(player: string, zone: Zone, where: string, target: string): string | undefined {
  const ours = Memory.ourAttacks?.[player]
  if (ours && Game.time - ours.tick <= PROVOKED_TICKS)
    return `we attacked their ${ours.what} in ${ours.room} ${Game.time - ours.tick} ticks before`
  if (zone === "theirs") return `${target} was in ${where}`
  return undefined
}
