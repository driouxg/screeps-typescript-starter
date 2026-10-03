import { isAlly } from "config/relations"
import * as creepRoles from "creeps/roles"
import { recordIntel } from "expansion/intel"
import { noteFlagged } from "defence/aggressionLog"
import { markRazed, trackRazedRooms } from "remote/razed"
import { assessConquests, assessRoom, MAX_WAVES, sideName, STALE_TICKS } from "./assessment"
import { recordSiege } from "./siegeIntel"
import { bodyFor, MemberKind, TemplateName, templateNamed } from "./squadMeta"

/**
 * Goal: Take another player's base, once the player has approved it from the dashboard: break in where their walls
 * are weakest (see conquest/siegeIntel), destroy their towers and spawns, and run their controller down until it's
 * free to claim (then expansion claims it, see ExpansionPlanner). One conquest at a time, and never on our own: the
 * bot ranks the bases it could take (see conquest/assessment) and waits for the player's sign-off.
 *
 * States of the wave being sent (Memory.conquest.state):
 *   scouting  the intel was stale when approved: a scout goes for a fresh look (see expansion/scoutRequests), then
 *             the plan is made again. If it no longer looks feasible the conquest waits (awaiting) for the player to
 *             approve it again, with the override if they want to go anyway.
 *   staging   the home spawns the wave's squad (see ConquestSpawnHandler); spawned members wait at home.
 *   rallying  all spawned: the members whose lifetimes have run down most are renewed at the home's spawns (a spawn
 *             renewing isn't used for spawning that tick) until every member has at least the trip and MIN_WORK_TICKS
 *             of work left and they're all within TTL_SPREAD ticks of each other, so the squad leaves, fights and
 *             dies together instead of losing members one by one.
 *   marching  the squad walks to the staging room (the room next to the side we break in from) as a group and
 *             gathers by the exit.
 *   engaged   it fights (see ConquerorHandler), in phases (Memory.conquest.phase):
 *               drain   (when the plan is a drain, see conquest/assessment) hold the tile on the room's edge where
 *                       their towers hit least, out-healing them, and kill the miners of sources outside their
 *                       walls; their remotes are raided meanwhile (a strike every RAID_INTERVAL, see
 *                       defence/retaliation). Once their towers are down to TOWER_DRY energy each, on to the breach;
 *               breach  dismantle the barriers on the way in, outermost first (refreshed from the room as it changes);
 *               raze    destroy their towers, then spawns (whatever barrier is in the way first);
 *               claim   claimers run their controller's downgrade timer down (attackController, once every
 *                       CONTROLLER_ATTACK_BLOCKED_UPGRADE ticks) while the squad guards; once the controller is free,
 *                       it's handed to expansion and the conquest is won.
 *             Members below RETREAT_AT of their hits pull the whole squad back to the staging room, out of the towers'
 *             reach, until all are healed to RESUME_AT (this also drains their towers' energy).
 * Waves: when the wave fighting won't live to finish the work left (the hits still standing at its siege rate), the
 * next wave is staged in time (its spawning, rallying and trip, plus RELIEF_LEAD) to arrive as the first runs out; a
 * wave wiped out is replaced the same way, up to maxWaves.
 * The conquest ends when won, called off from the dashboard, the owner turns out to be an ally, they switch on safe
 * mode, every wave is lost, or it takes longer than TIMEOUT_TICKS (before the claim phase). Its squad then goes home
 * to be recycled.
 */

/** Rankings are refreshed this often. */
const ASSESS_TICKS = 500
const MIN_WORK_TICKS = 300
const TTL_SPREAD = 100
/** Renewals stop while the home has less energy than this in its spawns and extensions (for its own spawning). */
const RENEW_ENERGY_FLOOR = 300
/** Members are renewed while the rest of the wave spawns only if they'd otherwise have less than this left to work. */
const STAGING_FLOOR = 500
const RALLY_TIMEOUT = 400
const SCOUT_TIMEOUT = 3000
const STAGING_TIMEOUT = 4000
const TIMEOUT_TICKS = 25000
const RETREAT_AT = 0.55
const RESUME_AT = 0.9
/** Slack, on top of spawning and the trip, for the next wave to arrive before the fighting one runs out. */
const RELIEF_LEAD = 200
/** Under fire the squad steps out to heal now and then: work takes this much longer. */
const WORK_OVERHEAD = 1.3
/** Lifetime a renewal adds is this times CREEP_LIFE_TIME / CREEP_SPAWN_TIME over the body's size (the game's constant). */
const SPAWN_RENEW_RATIO = 1.2
/** Towers with less energy than this each are dry: the drain is over. */
const TOWER_DRY = 50
/** While draining, their remotes are raided (a retaliation strike) at most this often. */
const RAID_INTERVAL = 500
/** The target's siege intel is refreshed this often while we can see it. */
const SIEGE_REFRESH = 25

export type ConquestState = "scouting" | "awaiting" | "staging" | "rallying" | "marching" | "engaged" | "over"
export type ConquestPhase = "drain" | "breach" | "raze" | "claim"

export interface Conquest {
  room: string
  player: string
  home: string
  /** The room next to the target on the side we break in from, where the squad gathers. */
  staging: string
  side: ExitConstant
  entry: { x: number; y: number }
  state: ConquestState
  phase: ConquestPhase
  status: string
  template: TemplateName
  /** The squad each wave is spawned as. */
  members: { kind: MemberKind; body: BodyPartConstant[] }[]
  wave: number
  maxWaves: number
  /** Tick approved, and whether the player overrode the bot's verdict. */
  approved: number
  forced: boolean
  /** Ticks to walk from home to the staging room. */
  travel: number
  stateSince: number
  retreating?: boolean
  /** What the squad is hitting: a barrier, tower or spawn. */
  focus?: { id: string; x: number; y: number }
  barriersLeft?: number
  /** Tick their controller can next be attacked. */
  nextClaimAttack?: number
  /** assault: break in under fire; drain: run their towers dry from the room's edge first (see conquest/assessment). */
  strategy?: "assault" | "drain"
  /** Where the squad holds while draining. */
  hold?: { x: number; y: number }
  /** Raid their remotes while draining, and when next. */
  raidRemotes?: boolean
  nextRaid?: number
  /** Energy in their towers when last seen. */
  towerEnergy?: number
  result?: string
  ended?: number
}

/** From the dashboard: approve a conquest, or call it off. */
export interface ConquestRequest {
  room: string
  action: "approve" | "cancel"
  /** Go ahead even if the bot thinks it can't win. */
  force?: boolean
  /** The squad template to use instead of the one for the home's RCL. */
  template?: TemplateName
  /** When it was asked for (ms since epoch). */
  requested: number
  status?: string
  done?: boolean
}

export interface ConquerorMemory extends CreepMemory {
  /** The room being conquered. */
  conquest: string
  kind: MemberKind
  wave: number
  /** Its place in the conquest's members. */
  slot: number
  targetId?: Id<Creep | Structure>
  /** Tick it stepped off an exit tile (see ConquerorHandler): it doesn't move again that tick. */
  steppedIn?: number
}

declare global {
  interface Memory {
    /** The conquest underway, or how the last one ended (see conquest/conquest.ts). */
    conquest?: Conquest | null
    /** The player's approval or call-off from the dashboard. */
    conquestRequest?: ConquestRequest | null
  }
  interface CreepMemory {
    /** Going to a spawn to be renewed (see conquest/conquest rallying); not loitering. */
    renewing?: boolean
  }
}

export function conquest(): Conquest | null {
  return Memory.conquest ?? null
}

/** Our creeps on the conquest of `room` (claimers too). */
export function conquerors(room: string): Creep[] {
  return Object.values(Game.creeps).filter(
    c => c.memory.role === creepRoles.CONQUEROR && (c.memory as ConquerorMemory).conquest === room
  )
}

/** The fighting members (not claimers) of a wave, or of every wave. */
export function squadOf(c: Conquest, wave?: number): Creep[] {
  return conquerors(c.room).filter(m => {
    const memory = m.memory as ConquerorMemory
    return memory.kind !== "claimer" && (wave === undefined || memory.wave === wave)
  })
}

/** A hold tile at least 2 in from the edge (intel recorded before HOLD_DEPTH was 2 had it right by the edge). */
function clampHold(hold: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.max(2, Math.min(47, hold.x)), y: Math.max(2, Math.min(47, hold.y)) }
}

/** Where the squad gathers in the staging room: across the border from the breach's entry, a few tiles in. */
export function rallyPoint(c: Conquest): RoomPosition {
  const { x, y } = c.entry
  switch (c.side) {
    case FIND_EXIT_TOP:
      return new RoomPosition(x, 45, c.staging)
    case FIND_EXIT_BOTTOM:
      return new RoomPosition(x, 4, c.staging)
    case FIND_EXIT_LEFT:
      return new RoomPosition(45, y, c.staging)
    default:
      return new RoomPosition(4, y, c.staging)
  }
}

let renewedTick = -1
const renewedSpawns = new Set<string>()

/** Whether `spawn` renewed a conqueror this tick, so it can't spawn (see SpawnComposer). */
export function renewingThisTick(spawn: StructureSpawn): boolean {
  return renewedTick === Game.time && renewedSpawns.has(spawn.id)
}

/** Advance the conquest, once a tick, and refresh the rankings now and then. */
export function runConquest(): void {
  trackRazedRooms()
  runRequest()
  if (ASSESS_TICKS <= Game.time - (Memory.conquestAssessed ?? -Infinity) || rescouted()) assessConquests()

  const c = Memory.conquest
  if (!c || c.state === "over") return
  if (isAlly(c.player)) return end(c, `called off: ${c.player} is an ally now`)

  const room = Game.rooms[c.room]
  if (room && watchTarget(c, room)) return
  if (c.phase !== "claim" && TIMEOUT_TICKS < Game.time - c.approved)
    return end(c, `failed: not taken within ${TIMEOUT_TICKS} ticks`)

  switch (c.state) {
    case "scouting":
      return scouting(c)
    case "awaiting":
      return
    case "staging":
      return staging(c)
    case "rallying":
      return rallying(c)
    case "marching":
      return marching(c)
    case "engaged":
      return engaged(c, room)
  }
}

/** Whether a base ranked on stale intel (or with its walls unmapped) has been seen since: re-rank it straight away. */
function rescouted(): boolean {
  const assessed = Memory.conquestAssessed ?? 0
  return (Memory.conquestCandidates ?? []).some(c => {
    const stale = c.siegeAge === undefined || STALE_TICKS < c.siegeAge || STALE_TICKS < c.intelAge
    const memory = Memory.rooms[c.room]
    return stale && assessed < (memory?.siege?.tick ?? memory?.intel?.tick ?? 0)
  })
}

/** Act on the player's approval or call-off from the dashboard, once. */
function runRequest(): void {
  const request = Memory.conquestRequest
  if (!request || request.done) return
  request.done = true
  const current = Memory.conquest && Memory.conquest.state !== "over" ? Memory.conquest : null

  if (request.action === "cancel") {
    if (!current || current.room !== request.room) request.status = `${request.room} isn't being conquered`
    else {
      end(current, "called off from the dashboard")
      request.status = "called off; the squad is coming home"
    }
    return
  }

  if (current && current.room !== request.room) {
    request.status = `a conquest of ${current.room} is underway: call it off first`
    return
  }
  if (current && current.state !== "awaiting") {
    request.status = `already underway: ${current.status}`
    return
  }
  const candidate = assessRoom(request.room, request.template)
  if (!candidate) {
    request.status = `not approved: we have no intel showing ${request.room} as another player's base`
    return
  }
  if (isAlly(candidate.player)) {
    request.status = `not approved: ${candidate.player} is an ally`
    return
  }
  if (candidate.safeModeUntil) {
    request.status = `not approved: ${request.room} is in safe mode until tick ${candidate.safeModeUntil}`
    return
  }
  if (!candidate.home) {
    request.status = `not approved: ${candidate.verdict}`
    return
  }
  const stale =
    candidate.siegeAge === undefined || STALE_TICKS < candidate.siegeAge || STALE_TICKS < candidate.intelAge
  if (!stale && !candidate.feasible && !request.force) {
    request.status = `not approved: ${candidate.verdict}. Approve with the override to go anyway.`
    return
  }

  // Approved, or approved again after a fresh look (a conquest awaiting the player).
  const template = (request.template ?? candidate.squad?.template ?? "duo") as TemplateName
  const c: Conquest = current ?? {
    room: request.room,
    player: candidate.player,
    home: candidate.home,
    staging: "",
    side: FIND_EXIT_TOP,
    entry: { x: 25, y: 0 },
    state: "scouting",
    phase: "breach",
    status: "",
    template,
    members: [],
    wave: 1,
    maxWaves: 2,
    approved: Game.time,
    forced: !!request.force,
    travel: 0,
    stateSince: Game.time
  }
  c.forced = c.forced || !!request.force
  c.template = template
  Memory.conquest = c
  // At war with them now: our defence treats their creeps as hostile, and paths keep out of their other rooms.
  if (Memory.hostilePlayers?.[c.player] === undefined) {
    Memory.hostilePlayers = { ...(Memory.hostilePlayers ?? {}), [c.player]: Game.time }
    noteFlagged(c.player, `you approved the conquest of their base ${c.room}`)
  }

  // Approved again after the scout couldn't get there: go on what we know, if we know the way in.
  if (stale && (!current || !candidate.breach)) {
    setState(c, "scouting", `approved; sending a scout for a fresh look at ${c.room} first`)
    c.approved = Game.time
    request.status = c.status
  } else {
    plan(c, candidate)
    request.status = `approved: ${c.status}`
  }
  console.log(`Conquest ${c.room}: ${request.status}`)
}

/** Fill in the plan from an assessment and start staging the first wave. */
function plan(c: Conquest, candidate: NonNullable<ReturnType<typeof assessRoom>>): void {
  const home = Game.rooms[candidate.home!]
  const breach = candidate.breach
  if (!breach || !candidate.squad || !home) {
    setState(c, "awaiting", `no plan: ${candidate.verdict}`)
    return
  }
  c.home = candidate.home!
  c.staging = breach.staging
  c.side = breach.sideConstant as ExitConstant
  c.entry = breach.entry
  c.travel = candidate.estimate?.travelTicks ?? 500
  c.strategy = candidate.estimate?.strategy === "drain" ? "drain" : "assault"
  c.hold = breach.hold && clampHold(breach.hold)
  c.raidRemotes = !!candidate.supply?.raidRemotes
  if (c.wave === 1 && c.phase === "breach" && c.strategy === "drain") c.phase = "drain"
  c.maxWaves = Math.max(2, Math.min(MAX_WAVES * 2, (candidate.estimate?.waves ?? 1) + 1))
  // Bodies from the plan, rebuilt for the home's capacity now (the plan gives only part counts).
  const energy = Math.max(...candidate.squad.members.map(m => m.cost))
  c.members = candidate.squad.members.map(m => ({ kind: m.kind as MemberKind, body: bodyFor(m.kind as MemberKind, energy) }))
  setState(
    c,
    "staging",
    `wave ${c.wave}/${c.maxWaves}: spawning a ${c.template} squad of ${c.members.length} in ${c.home}, to break in from the ${
      breach.side
    } via ${c.staging}${c.strategy === "drain" ? ", draining their towers first" : ""}`
  )
}

function scouting(c: Conquest): void {
  const memory = Memory.rooms[c.room]
  const fresh = memory?.intel && c.approved <= memory.intel.tick && memory.siege && c.approved <= memory.siege.tick
  if (!fresh) {
    if (SCOUT_TIMEOUT < Game.time - c.stateSince)
      return setState(c, "awaiting", `couldn't get a fresh look at ${c.room} in ${SCOUT_TIMEOUT} ticks: approve again to go on what we know`)
    const requests = (Memory.scoutRequests = Memory.scoutRequests ?? {})
    const request = requests[c.room]
    if (!request || request.done) requests[c.room] = { requested: Date.now() }
    c.status = `waiting for a scout's look at ${c.room}`
    return
  }
  const candidate = assessRoom(c.room, c.template)
  if (!candidate) return end(c, `called off: ${c.room} isn't another player's base any more`)
  if (candidate.feasible || c.forced) return plan(c, candidate)
  setState(c, "awaiting", `after a fresh look: ${candidate.verdict}. Approve with the override to go anyway.`)
}

function staging(c: Conquest): void {
  const wave = squadOf(c, c.wave)
  renew(c, wave, m => (m.ticksToLive ?? CREEP_LIFE_TIME) < c.travel + STAGING_FLOOR)
  const ready = wave.filter(m => !m.spawning).length
  if (c.members.length <= ready) {
    setState(c, "rallying", `wave ${c.wave}: lining up lifetimes before setting out`)
    return
  }
  if (STAGING_TIMEOUT < Game.time - c.stateSince) return end(c, `failed: wave ${c.wave} took too long to spawn`)
  c.status = `wave ${c.wave}/${c.maxWaves}: spawned ${ready} of ${c.members.length} in ${c.home}${
    c.phase === "breach" || c.phase === "drain" ? "" : ` (${c.phase} phase)`
  }`
}

/** Renew members of `wave` that `needs` says should be, at the home's idle spawns, lowest lifetime first. */
function renew(c: Conquest, wave: Creep[], needs: (m: Creep) => boolean): void {
  const home = Game.rooms[c.home]
  for (const m of wave) m.memory.renewing = !m.spawning && needs(m)
  if (!home) return
  if (renewedTick !== Game.time) {
    renewedTick = Game.time
    renewedSpawns.clear()
  }
  const waiting = wave.filter(m => m.memory.renewing && m.room.name === c.home)
  for (const spawn of home.find(FIND_MY_SPAWNS)) {
    if (spawn.spawning || home.energyAvailable < RENEW_ENERGY_FLOOR) continue
    const next = waiting
      .filter(m => spawn.pos.isNearTo(m))
      .sort((a, b) => (a.ticksToLive ?? 0) - (b.ticksToLive ?? 0))[0]
    if (next && spawn.renewCreep(next) === OK) renewedSpawns.add(spawn.id)
  }
}

function rallying(c: Conquest): void {
  const wave = squadOf(c, c.wave)
  if (wave.length < c.members.length) return setState(c, "staging", `wave ${c.wave}: a member died before setting out`)

  const required = c.travel + MIN_WORK_TICKS
  const ttl = (m: Creep) => m.ticksToLive ?? CREEP_LIFE_TIME
  const highest = Math.max(...wave.map(ttl))
  const goal = Math.max(required, highest - TTL_SPREAD / 2)
  const step = (m: Creep) => Math.floor((SPAWN_RENEW_RATIO * CREEP_LIFE_TIME) / CREEP_SPAWN_TIME / m.body.length)
  renew(c, wave, m => ttl(m) < goal && ttl(m) + step(m) <= CREEP_LIFE_TIME)

  const lowest = Math.min(...wave.map(ttl))
  const aligned = required <= lowest && highest - lowest <= TTL_SPREAD
  const timedOut = RALLY_TIMEOUT < Game.time - c.stateSince && required <= lowest
  if (aligned || timedOut) {
    for (const m of wave) delete m.memory.renewing
    setState(
      c,
      "marching",
      `wave ${c.wave}: setting out for ${c.staging} with ${lowest}-${highest} ticks to live (trip ~${c.travel})`
    )
    return
  }
  if (3 * RALLY_TIMEOUT < Game.time - c.stateSince)
    return end(c, `failed: wave ${c.wave} couldn't be renewed to last the trip (home short of energy?)`)
  c.status = `wave ${c.wave}: renewing (lifetimes ${lowest}-${highest}, want all over ${required} within ${TTL_SPREAD})`
}

function marching(c: Conquest): void {
  const wave = squadOf(c, c.wave)
  if (wave.length <= 0) return waveLost(c)
  const rally = rallyPoint(c)
  const gathered = wave.filter(m => m.pos.roomName === c.staging && m.pos.inRangeTo(rally, 5)).length
  if (wave.length <= gathered) {
    setState(c, "engaged", `wave ${c.wave}: going in from the ${sideName(c.side)}`)
    return
  }
  if (Math.max(600, c.travel * 3) < Game.time - c.stateSince) {
    setState(c, "engaged", `wave ${c.wave}: ${gathered} of ${wave.length} gathered; going in with what's there`)
    return
  }
  c.status = `wave ${c.wave}: marching to ${c.staging}, ${gathered} of ${wave.length} there`
}

function engaged(c: Conquest, room: Room | undefined): void {
  const all = squadOf(c)
  const wave = squadOf(c, c.wave)
  if (wave.length <= 0) return waveLost(c)

  // Pull back to heal: someone in the room is badly hurt; go back in once everyone is healed.
  const inside = all.filter(m => m.room.name === c.room)
  const ratio = (m: Creep) => m.hits / m.hitsMax
  if (!c.retreating && inside.some(m => ratio(m) < RETREAT_AT)) c.retreating = true
  else if (c.retreating && all.every(m => RESUME_AT <= ratio(m))) delete c.retreating

  if (room) c.focus = pickFocus(c, room, wave)

  // Relief: this wave won't live to finish; stage the next in time for it to arrive as this one runs out.
  // Draining: keep their remotes' miners away too, so their income can't refill the towers.
  if (c.phase === "drain" && c.raidRemotes && Game.time >= (c.nextRaid ?? 0)) {
    const strike = Memory.retaliation
    if (!strike || strike.state === "over") {
      Memory.retaliation = { player: c.player, requested: Date.now() }
      console.log(`Conquest ${c.room}: raiding ${c.player}'s remotes to starve their towers`)
    }
    c.nextRaid = Game.time + RAID_INTERVAL
  }

  const lowest = Math.min(...wave.map(m => m.ticksToLive ?? CREEP_LIFE_TIME))
  const workLeft = (remainingHits(c) / Math.max(1, siegeRate(wave))) * WORK_OVERHEAD
  if (c.phase !== "claim" && c.wave < c.maxWaves && lowest < workLeft && lowest < reliefLead(c)) {
    c.wave++
    setState(c, "staging", `wave ${c.wave}/${c.maxWaves}: relieving the wave fighting (${lowest} ticks left)`)
    return
  }

  const what =
    c.phase === "drain"
      ? `draining their towers from the edge: ${c.towerEnergy ?? "?"} energy left in them`
      : c.phase === "breach"
      ? `breaking in: ${c.barriersLeft ?? "?"} barrier(s) left`
      : c.phase === "raze"
      ? "inside: destroying their towers and spawns"
      : `core down: running their controller down${c.nextClaimAttack ? ` (next attack at tick ${c.nextClaimAttack})` : ""}`
  c.status = `wave ${c.wave}: ${c.retreating ? "pulled back to heal; " : ""}${what}`
}

/** Hits still to take down: what's left of the way in, and their towers and spawns (from the latest siege intel). */
function remainingHits(c: Conquest): number {
  if (c.phase === "claim") return 0
  const siege = Memory.rooms[c.room]?.siege
  // Draining takes as long as their energy lasts: keep the waves coming.
  if (!siege || c.phase === "drain") return Infinity
  const breach = c.phase === "breach" ? siege.breaches.find(b => b.side === c.side)?.hits ?? 0 : 0
  return breach + siege.coreHits
}

function siegeRate(wave: Creep[]): number {
  return wave.reduce(
    (sum, m) =>
      sum +
      m.getActiveBodyparts(WORK) * DISMANTLE_POWER +
      m.getActiveBodyparts(ATTACK) * ATTACK_POWER +
      m.getActiveBodyparts(RANGED_ATTACK) * RANGED_ATTACK_POWER,
    0
  )
}

/** Ticks from deciding to send a wave to its arrival: spawning it (over the home's spawns), rallying, the trip. */
function reliefLead(c: Conquest): number {
  const spawns = Math.max(1, Game.rooms[c.home]?.find(FIND_MY_SPAWNS).length ?? 1)
  const parts = c.members.reduce((sum, m) => sum + m.body.length, 0)
  return (parts * CREEP_SPAWN_TIME) / spawns + RELIEF_LEAD + c.travel
}

/** The wave fighting is gone: send the next, or give up. */
function waveLost(c: Conquest): void {
  if (c.phase === "claim") {
    c.status = "core down, squad gone: claimers keep running their controller down"
    return
  }
  if (c.wave < c.maxWaves) {
    c.wave++
    setState(c, "staging", `wave ${c.wave - 1} lost; spawning wave ${c.wave}/${c.maxWaves}`)
    return
  }
  end(c, `failed: lost all ${c.maxWaves} waves`)
}

/**
 * With vision of the target: refresh its intel, move the phase on, and end the conquest if it's won or they switched
 * safe mode on. True if it ended.
 */
function watchTarget(c: Conquest, room: Room): boolean {
  recordIntel(room)
  if (Game.time % SIEGE_REFRESH === 0) recordSiege(room, true)
  const controller = room.controller
  if (!controller) {
    end(c, "called off: the room has no controller")
    return true
  }
  if (!controller.owner) {
    if (c.state === "engaged" || c.phase === "raze" || c.phase === "claim") end(c, `won: ${c.player}'s controller is free; ${handOff(c.room)}`)
    else end(c, `called off: nobody owns ${c.room} any more`)
    return true
  }
  if (controller.owner.username !== c.player) {
    end(c, `called off: ${c.room} now belongs to ${controller.owner.username}`)
    return true
  }
  if (controller.safeMode) {
    end(c, `halted: ${c.player} switched on safe mode (${controller.safeMode} ticks)`)
    return true
  }

  const core = room.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER || s.structureType === STRUCTURE_SPAWN
  })
  const breach = room.memory.siege?.breaches.find(b => b.side === c.side)
  c.barriersLeft = breach?.barriers.length
  const towers = core.filter(s => s.structureType === STRUCTURE_TOWER) as StructureTower[]
  c.towerEnergy = towers.reduce((sum, t) => sum + t.store.energy, 0)
  if (c.phase === "drain" && c.towerEnergy < towers.length * TOWER_DRY) {
    c.phase = "breach"
    console.log(`Conquest ${c.room}: their towers are dry; breaking in`)
  }
  if (c.phase === "breach" && (!breach || breach.barriers.length === 0)) c.phase = "raze"
  if (c.phase === "raze" && core.length === 0) {
    c.phase = "claim"
    // Nothing there shoots any more: mine its sources while the controller runs down (see remote/razed).
    markRazed(c.room, c.player)
    console.log(`Conquest ${c.room}: towers and spawns down; running their controller down`)
  }
  if (c.phase === "claim" && 0 < core.length) c.phase = "raze"
  if (controller.upgradeBlocked) c.nextClaimAttack = Game.time + controller.upgradeBlocked
  return false
}

/** Hand the freed controller to expansion (see ExpansionPlanner). */
function handOff(room: string): string {
  if (Memory.expansion || Memory.expansionRequest) return "claim it from the expansion panel once expansion is free"
  Memory.expansionRequest = { target: room }
  return "expansion will claim it"
}

/**
 * What the squad hits: in the breach phase, the outermost barrier left on the way in; then the nearest tower (or
 * spawn) and whatever barrier stands between the squad and it; in the claim phase, the rest of their buildings
 * (but not storage or terminal: there's loot in them).
 */
function pickFocus(c: Conquest, room: Room, wave: Creep[]): Conquest["focus"] {
  const current = c.focus ? Game.getObjectById(c.focus.id as Id<Structure>) : null
  // Keep hitting it until it's down, unless the phase moved on.
  if (current && Game.time % 10 !== 0) return c.focus

  const at = (x: number, y: number): Structure | undefined => {
    const here = room.lookForAt(LOOK_STRUCTURES, x, y)
    return (
      here.find(s => s.structureType === STRUCTURE_RAMPART && !s.my) ??
      here.find(s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && "hits" in s && !!s.hits)
    )
  }
  const focus = (s: Structure | undefined | null) => (s ? { id: s.id as string, x: s.pos.x, y: s.pos.y } : undefined)

  if (c.phase === "drain") return undefined
  if (c.phase === "breach") {
    const breach = room.memory.siege?.breaches.find(b => b.side === c.side)
    for (const b of breach?.barriers ?? []) {
      const s = at(b.x, b.y)
      if (s) return focus(s)
    }
    return undefined
  }

  const leader = wave.find(m => m.room.name === c.room) ?? wave[0]
  const from = leader && leader.room.name === c.room ? leader.pos : new RoomPosition(c.entry.x, c.entry.y, c.room)
  const theirs = room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.owner?.username === c.player })
  let targets: Structure[]
  if (c.phase === "raze") {
    const towers = theirs.filter(s => s.structureType === STRUCTURE_TOWER)
    targets = towers.length ? towers : theirs.filter(s => s.structureType === STRUCTURE_SPAWN)
  } else
    targets = theirs.filter(
      s =>
        s.structureType !== STRUCTURE_CONTROLLER &&
        s.structureType !== STRUCTURE_RAMPART &&
        s.structureType !== STRUCTURE_STORAGE &&
        s.structureType !== STRUCTURE_TERMINAL
    )
  const target = from.findClosestByRange(targets)
  if (!target) return undefined
  return focus(barrierBefore(room, from, target) ?? at(target.pos.x, target.pos.y) ?? target)
}

/** The first wall or rampart on the cheapest path from `from` to `target`, if one's in the way. */
function barrierBefore(room: Room, from: RoomPosition, target: Structure): Structure | undefined {
  const blocking = new Map<number, Structure>()
  const matrix = new PathFinder.CostMatrix()
  for (const s of room.find(FIND_STRUCTURES)) {
    if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) continue
    if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue
    if (s.id === target.id) continue
    const k = s.pos.y * 50 + s.pos.x
    if (typeof s.hits !== "number" || s.structureType === STRUCTURE_CONTROLLER) {
      matrix.set(s.pos.x, s.pos.y, 0xff)
      continue
    }
    // Passable at a price that grows with its hits, so the thinnest way through is taken.
    matrix.set(s.pos.x, s.pos.y, Math.min(250, 20 + Math.floor(s.hits / 100000)))
    const existing = blocking.get(k)
    if (!existing || s.structureType === STRUCTURE_RAMPART) blocking.set(k, s)
  }
  const result = PathFinder.search(
    from,
    { pos: target.pos, range: 1 },
    { maxRooms: 1, maxOps: 4000, roomCallback: name => (name === room.name ? matrix : false) }
  )
  for (const p of result.path) {
    const s = blocking.get(p.y * 50 + p.x)
    if (s) return s
  }
  return undefined
}

function setState(c: Conquest, state: ConquestState, status: string): void {
  if (c.state !== state) c.stateSince = Game.time
  c.state = state
  c.status = status
  if (state !== "awaiting") console.log(`Conquest ${c.room}: ${status}`)
  else console.log(`Conquest ${c.room}: waiting for the player: ${status}`)
}

/** End the conquest; its creeps see it and go home (see ConquerorHandler). */
export function end(c: Conquest, result: string): void {
  console.log(`Conquest ${c.room}: ${result}`)
  c.state = "over"
  c.result = result
  c.status = result
  c.ended = Game.time
  delete c.focus
  delete c.retreating
}

/** For the dashboard. */
export function templateDescription(name: TemplateName): string {
  return templateNamed(name)?.description ?? name
}
