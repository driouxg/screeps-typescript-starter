import { controls } from "config/controls"
import { isAlly, relationOf } from "config/relations"
import * as creepRoles from "creeps/roles"
import { describe, ourStrength, playerStrength } from "defence/strength"
import { recordIntel } from "expansion/intel"
import { myUsername } from "utils/username"

/**
 * Goal: Take over remote rooms another player reserves, when we're clearly the stronger (see defence/strength), so we
 * can reserve and mine them ourselves. Never against an ally, and only with aggression "aggressive" (see
 * config/controls): it means attacking their creeps.
 *
 * The RemotePlanner asks (considerContest) about each room in reach that it would mine but someone else reserves. A
 * contest starts if our strength is at least STRENGTH_MARGIN times theirs, and only once we've seen one of their
 * bases (an unknown player could be anything). Then (see ContestSpawnHandler):
 *   1. CONTEST_ATTACKERS attackers go in and kill that player's creeps there, their reserver above all;
 *   2. once they're out, a reserver of ours runs down their reservation (attackController: a tick per CLAIM part a
 *      tick, on top of the reservation's own decay) and reserves the room for us;
 *   3. reserved by us, the room is a remote like any other (the planner re-plans straight away), defended as usual.
 * A contest is given up (and the room left alone for BLOCK_TICKS) when it takes over TIMEOUT_TICKS, when more than
 * MAX_ATTACKERS_SPAWNED attackers have been spent on it, or when they've grown to within STRENGTH_MARGIN of us.
 */

const STRENGTH_MARGIN = 2
/** Contests at a time, over all our bases. */
const MAX_CONTESTS = 1
/** A home needs this RCL to send attackers worth sending. */
const MIN_HOME_RCL = 4
export const CONTEST_ATTACKERS = 2
const MAX_ATTACKERS_SPAWNED = 6
const TIMEOUT_TICKS = 6000
const BLOCK_TICKS = 20000
/** Strength is compared again this often while a contest lasts. */
const RECHECK_TICKS = 500

export interface Contest {
  player: string
  home: string
  started: number
  /** What's happening, for the planner's report. */
  status: string
  /** Attackers spawned for it so far (see MAX_ATTACKERS_SPAWNED). */
  attackersSpawned: number
}

declare global {
  interface Memory {
    /** Remote rooms we're taking from another player (see remote/contest.ts). */
    remoteContests?: { [roomName: string]: Contest }
    /** Rooms not to contest again until the given tick. */
    contestBlocked?: { [roomName: string]: number }
    /** Re-plan remotes next tick (a contest was just won). */
    remotesReplan?: boolean
  }
}

export function contestOf(roomName: string): Contest | undefined {
  return Memory.remoteContests?.[roomName]
}

/** Whether `creep` belongs to the player whose reserved room it's in that we're contesting. */
export function isContested(creep: Creep): boolean {
  return contestOf(creep.room.name)?.player === creep.owner.username
}

/**
 * For the planner: a room it would mine from `home` but `player` reserves. Starts a contest if we should, and says
 * why the room is or isn't being taken.
 */
export function considerContest(home: Room, roomName: string, player: string): string {
  const current = contestOf(roomName)
  if (current) return `reserved by ${player}: contesting (${current.status})`
  if (isAlly(player)) return `reserved by ${player} (ally)`
  if (controls().aggression !== "aggressive")
    return `reserved by ${player} (contested only with aggression "aggressive")`
  const blocked = Memory.contestBlocked?.[roomName] ?? 0
  if (Game.time < blocked) return `reserved by ${player}; contest given up until tick ${blocked}`
  if ((home.controller?.level ?? 0) < MIN_HOME_RCL) return `reserved by ${player}; contests start from RCL ${MIN_HOME_RCL}`

  const theirs = playerStrength(player)
  if (!theirs) return `reserved by ${player}, strength unknown (none of their bases seen): not contested`
  const ours = ourStrength()
  const versus = `their strength ${describe(theirs)} vs ours ${describe(ours)}`
  if (ours.score < STRENGTH_MARGIN * theirs.score) return `reserved by ${player}: ${versus}, not contested`
  if (MAX_CONTESTS <= Object.keys(Memory.remoteContests ?? {}).length)
    return `reserved by ${player}: ${versus}, another contest is underway`

  const status = `sending ${CONTEST_ATTACKERS} attackers from ${home.name}`
  Memory.remoteContests = {
    ...(Memory.remoteContests ?? {}),
    [roomName]: { player, home: home.name, started: Game.time, status, attackersSpawned: 0 }
  }
  console.log(`Contest ${roomName}: taking it from ${player}, ${versus}`)
  return `reserved by ${player}: ${versus}, contesting (${status})`
}

/** Advance the contests, once a tick: won, given up, or still going. */
export function runContests(): void {
  for (const [roomName, contest] of Object.entries(Memory.remoteContests ?? {})) {
    if (relationOf(contest.player) === "ally" || controls().aggression !== "aggressive")
      end(roomName, "called off (ally, or aggression no longer aggressive)", false)
    else if (TIMEOUT_TICKS < Game.time - contest.started) end(roomName, "taking too long", true)
    else if (MAX_ATTACKERS_SPAWNED < contest.attackersSpawned) end(roomName, "losing attackers", true)
    else if ((Game.time - contest.started) % RECHECK_TICKS === RECHECK_TICKS - 1 && !stillStronger(contest))
      end(roomName, `${contest.player} is no longer clearly weaker`, true)
    else update(roomName, contest)
  }
}

function update(roomName: string, contest: Contest): void {
  const controller = Game.rooms[roomName]?.controller
  if (!controller) return
  const reservation = controller.reservation
  if (reservation?.username === myUsername()) {
    end(roomName, "won: reserved by us", false)
    // The planner reads the reservation from intel: refresh it, or it would see theirs and contest the room again.
    recordIntel(controller.room, true)
    Memory.remotesReplan = true
    return
  }
  const theirs = controller.room
    .find(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username === contest.player })
    .length
  contest.status = reservation
    ? `${theirs} of their creeps here, their reservation at ${reservation.ticksToEnd}`
    : `${theirs} of their creeps here, unreserved: reserving`
}

function stillStronger(contest: Contest): boolean {
  const theirs = playerStrength(contest.player)
  return !!theirs && STRENGTH_MARGIN * theirs.score <= ourStrength().score
}

function end(roomName: string, why: string, block: boolean): void {
  console.log(`Contest ${roomName}: ${why}${block ? `; leaving it alone for ${BLOCK_TICKS} ticks` : ""}`)
  if (Memory.remoteContests) delete Memory.remoteContests[roomName]
  if (block) Memory.contestBlocked = { ...(Memory.contestBlocked ?? {}), [roomName]: Game.time + BLOCK_TICKS }
}

/** Creeps fighting for `roomName` (see ContesterHandler). */
export function contesters(roomName: string): Creep[] {
  return Object.values(Game.creeps).filter(
    c => c.memory.role === creepRoles.CONTESTER && (c.memory as { targetRoom?: string }).targetRoom === roomName
  )
}
