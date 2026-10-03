import { controls } from "config/controls"
import { isAlly, relationOf } from "config/relations"
import * as creepRoles from "creeps/roles"
import { describe, ourStrength, playerStrength } from "defence/strength"
import { recordIntel } from "expansion/intel"
import { myUsername } from "utils/username"
import { reservingBase } from "./reserving"

/**
 * Goal: Take over remote rooms another player reserves, when we're clearly the stronger (see defence/strength), so we
 * can reserve and mine them ourselves. Never against an ally, and only with aggression "aggressive" (see
 * config/controls): it means attacking their creeps.
 *
 * The RemotePlanner asks (considerContest) about each room in reach that it would mine but someone else reserves. A
 * contest starts if our strength is at least STRENGTH_MARGIN times theirs, and only once we've seen one of their
 * bases (an unknown player could be anything). Then (see ContestSpawnHandler):
 *   1. clearing: CONTEST_ATTACKERS attackers (one melee, one ranged: see ContesterHandler) go in and kill that
 *      player's creeps there, their reserver above all; a reserver of ours runs down their reservation
 *      (attackController: a tick per CLAIM part a tick, on top of the reservation's own decay) and reserves the room;
 *   2. holding: reserved by us, the room is a remote like any other (the planner re-plans straight away, so our miner
 *      moves in), while the attackers stay on guard and kill any of their creeps that come back;
 *   3. won: once the room has been ours and clear of their creeps for HOLD_TICKS, the attackers go home.
 *   Counting it won as soon as our reservation was on sent the attackers home with their miner, hauler and reserver
 *   still there, ready to take the room back.
 * A contest is given up (and the room left alone for BLOCK_TICKS) when it takes over TIMEOUT_TICKS, when more than
 * MAX_ATTACKERS_SPAWNED attackers have been spent on it, or when they've grown to within STRENGTH_MARGIN of us.
 *
 * The player can also pick a room to contest from the dashboard (Memory.contestRequest, see runRequest): that goes
 * ahead whatever the aggression and strength (it's their call), as long as the room is a remote someone else (not an
 * ally) reserves, within reach (manualMaxRoute) of one of our bases at MIN_HOME_RCL (or we couldn't mine it after).
 * The dashboard can call any contest off the same way. Every room the planner saw reserved by someone else is listed
 * for the dashboard (Memory.contestCandidates) with what it decided.
 */

const STRENGTH_MARGIN = 2
/** Contests at a time, over all our bases. */
const MAX_CONTESTS = 1
/**
 * A home needs this RCL to send attackers worth sending (6 ATTACK at RCL 3's 800 energy). The contest's reserver comes
 * from a base nearby that can afford 2 CLAIM if there is one (see remote/reserving: it then keeps the room reserved
 * after); otherwise from the contest's own base with what it can afford. At RCL 3 that's a single CLAIM: it still runs
 * their reservation down (a tick a tick on top of its own decay) and holds ours at a tick, so we mine the room until
 * the base reaches RCL 4 and reserves it properly, rather than not taking it at all.
 */
const MIN_HOME_RCL = 3
export const CONTEST_ATTACKERS = 2
const MAX_ATTACKERS_SPAWNED = 6
const TIMEOUT_TICKS = 6000
const BLOCK_TICKS = 20000
/** Ticks the room must stay reserved by us and clear of their creeps before the attackers go home. */
const HOLD_TICKS = 300
/** Strength is compared again this often while a contest lasts. */
const RECHECK_TICKS = 500
/**
 * How far a manually picked room may be from the base contesting it: as far as that base mines (see maxRoute in
 * RemotePlanner), or we couldn't mine it after.
 */
const manualMaxRoute = (level: number) => (level < 4 ? 1 : 2)

export interface Contest {
  player: string
  home: string
  started: number
  /** What's happening, for the planner's report. */
  status: string
  /** Attackers spawned for it so far (see MAX_ATTACKERS_SPAWNED). */
  attackersSpawned: number
  /** Picked from the dashboard: goes ahead whatever the aggression and strength. */
  manual?: boolean
  /** The base that sends the reserver, when it isn't `home` (a base nearby that can afford 2 CLAIM). */
  reserverHome?: string
  /** Reserved by us: the room is mined while the attackers guard it (see HOLD_TICKS). */
  holding?: boolean
  /** Since when the room has been ours and clear of their creeps. */
  clearSince?: number
}

/** From the dashboard: contest a room, or call a contest off. */
export interface ContestRequest {
  room: string
  cancel?: boolean
  /** When it was asked for (ms since epoch). */
  requested: number
  /** What the bot made of it. */
  status?: string
  done?: boolean
}

/** A room the planner saw reserved by someone else, and what it decided (see considerContest). */
export interface ContestCandidate {
  player: string
  home: string
  verdict: string
  tick: number
}

declare global {
  interface Memory {
    /** Remote rooms we're taking from another player (see remote/contest.ts). */
    remoteContests?: { [roomName: string]: Contest }
    /** Rooms not to contest again until the given tick. */
    contestBlocked?: { [roomName: string]: number }
    /** Re-plan remotes next tick (a contest was just won). */
    remotesReplan?: boolean
    /** The player's pick from the dashboard (see runRequest). */
    contestRequest?: ContestRequest | null
    /** Rooms the last plan saw reserved by someone else (see considerContest). */
    contestCandidates?: { [roomName: string]: ContestCandidate }
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
  const verdict = decide(home, roomName, player)
  Memory.contestCandidates = {
    ...(Memory.contestCandidates ?? {}),
    [roomName]: { player, home: home.name, verdict, tick: Game.time }
  }
  return verdict
}

function decide(home: Room, roomName: string, player: string): string {
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
  const reserverHome = reservingBase(roomName, home.name) ?? home.name

  const status = startStatus(home.name, reserverHome)
  Memory.remoteContests = {
    ...(Memory.remoteContests ?? {}),
    [roomName]: {
      player,
      home: home.name,
      started: Game.time,
      status,
      attackersSpawned: 0,
      ...(reserverHome !== home.name ? { reserverHome } : {})
    }
  }
  console.log(`Contest ${roomName}: taking it from ${player}, ${versus}`)
  return `reserved by ${player}: ${versus}, contesting (${status})`
}

/** Advance the contests, once a tick: won, given up, or still going. */
export function runContests(): void {
  watchRemoteReservations()
  runRequest()
  for (const [roomName, contest] of Object.entries(Memory.remoteContests ?? {})) {
    if (relationOf(contest.player) === "ally" || (!contest.manual && controls().aggression !== "aggressive"))
      end(roomName, "called off (ally, or aggression no longer aggressive)", false)
    else if (TIMEOUT_TICKS < Game.time - contest.started) end(roomName, "taking too long", true)
    else if (MAX_ATTACKERS_SPAWNED < contest.attackersSpawned) end(roomName, "losing attackers", true)
    else if (
      !contest.manual &&
      (Game.time - contest.started) % RECHECK_TICKS === RECHECK_TICKS - 1 &&
      !stillStronger(contest)
    )
      end(roomName, `${contest.player} is no longer clearly weaker`, true)
    else update(roomName, contest)
  }
}

/** Act on the player's pick from the dashboard, once: start a contest there, or call one off. */
function runRequest(): void {
  const request = Memory.contestRequest
  if (!request || request.done) return
  request.done = true
  const room = request.room
  const current = contestOf(room)
  if (request.cancel) {
    if (!current) request.status = `${room} isn't being contested`
    else {
      end(room, "called off from the dashboard", true)
      request.status = `called off; ${room} is left alone for ${BLOCK_TICKS} ticks`
    }
    return
  }
  if (current) {
    request.status = `${room} is already being contested (${current.status})`
    return
  }
  const why = whyNotContestable(room)
  if (why) {
    request.status = `not contested: ${why}`
    return
  }
  const player = Memory.rooms[room].intel!.controller!.reservedBy!
  const home = nearestHome(room)
  if (!home) {
    request.status = `not contested: no base of ours at RCL ${MIN_HOME_RCL}+ mines that far (1 room away from RCL 3, 2 from RCL 4)`
    return
  }
  const reserverHome = reservingBase(room, home) ?? home
  const status = startStatus(home, reserverHome)
  Memory.remoteContests = {
    ...(Memory.remoteContests ?? {}),
    [room]: {
      player,
      home,
      started: Game.time,
      status,
      attackersSpawned: 0,
      manual: true,
      ...(reserverHome !== home ? { reserverHome } : {})
    }
  }
  if (Memory.contestBlocked) delete Memory.contestBlocked[room]
  console.log(`Contest ${room}: taking it from ${player}, picked from the dashboard`)
  request.status = `contesting: ${status}`
}

/** Why the player's pick can't be contested, or null if it can (going by the room's intel). */
function whyNotContestable(room: string): string | null {
  const intel = Memory.rooms[room]?.intel
  if (!intel) return "never scouted (send a scout first)"
  const controller = intel.controller
  if (!controller) return "no controller"
  if (controller.owner) return `owned by ${controller.owner}, not a remote`
  if (!controller.reservedBy || controller.reservedBy === myUsername())
    return `not reserved by anyone else when last seen (tick ${intel.tick})`
  if (isAlly(controller.reservedBy)) return `reserved by ${controller.reservedBy}, an ally`
  if (0 < (intel.keeperLairs ?? 0)) return "source keepers"
  if (0 < intel.hostileStructures) return "it has towers, spawns or an invader core"
  if (!intel.sourcePositions?.length) return "no sources"
  if (MAX_CONTESTS <= Object.keys(Memory.remoteContests ?? {}).length)
    return "another contest is underway: call it off first"
  return null
}

function startStatus(home: string, reserverHome: string): string {
  return `sending ${CONTEST_ATTACKERS} attackers from ${home}${
    reserverHome !== home ? `, and a reserver from ${reserverHome}` : ""
  }`
}

/** Our base at MIN_HOME_RCL with a spawn closest to `room` (by route), within the rooms it mines (manualMaxRoute). */
function nearestHome(room: string): string | null {
  let best: { name: string; distance: number } | null = null
  for (const home of Object.values(Game.rooms)) {
    if (!home.controller?.my || home.controller.level < MIN_HOME_RCL || home.find(FIND_MY_SPAWNS).length <= 0) continue
    const route = Game.map.findRoute(home.name, room)
    if (route === ERR_NO_PATH || manualMaxRoute(home.controller.level) < route.length) continue
    if (!best || route.length < best.distance) best = { name: home.name, distance: route.length }
  }
  return best?.name ?? null
}

/**
 * Another player reserving a room we mine (it happens: they walk in while our miner builds its container) shouldn't
 * wait for the next plan: refresh the room's intel and re-plan now, which drops the room or, if we're strong enough,
 * contests it (see considerContest).
 */
function watchRemoteReservations(): void {
  const me = myUsername()
  const rooms = new Set(Object.values(Memory.remotes ?? {}).map(r => r.room))
  for (const name of rooms) {
    const room = Game.rooms[name]
    const holder = room?.controller?.reservation?.username
    if (!room || !holder || holder === me || Memory.remotesReplan) continue
    console.log(`Remote ${name}: reserved by ${holder} from under us; re-planning (contest or drop it)`)
    recordIntel(room, true)
    Memory.remotesReplan = true
  }
}

function update(roomName: string, contest: Contest): void {
  const controller = Game.rooms[roomName]?.controller
  if (!controller) return
  const reservation = controller.reservation
  const ours = reservation?.username === myUsername()
  const theirs = controller.room
    .find(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username === contest.player })
    .length

  if (ours && !contest.holding) {
    // Ours: mine it now, guarded. The planner reads the reservation from intel: refresh it, or it would see theirs
    // and contest the room again.
    contest.holding = true
    recordIntel(controller.room, true)
    Memory.remotesReplan = true
    console.log(`Contest ${roomName}: reserved by us; holding it while it's mined`)
  }
  if (ours && theirs <= 0) {
    contest.clearSince = contest.clearSince ?? Game.time
    if (HOLD_TICKS <= Game.time - contest.clearSince) return end(roomName, "won: ours, and clear of their creeps", false)
  } else delete contest.clearSince

  contest.status = ours
    ? theirs
      ? `holding: ours, ${theirs} of their creeps still here`
      : `holding: ours and clear for ${Game.time - (contest.clearSince ?? Game.time)} of ${HOLD_TICKS} ticks`
    : reservation
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
