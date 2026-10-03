import { isAlly, relationOf } from "config/relations"
import { ourStrength, playerStrength } from "defence/strength"
import type {
  ConquestCandidateSnapshot,
  ConquestConcern,
  ConquestSideSnapshot,
  ConquestSquadSnapshot
} from "dashboard/snapshot"
import { isHostileRoom, sameMapZone } from "utils/roomSafety"
import { myUsername } from "utils/username"
import { Breach, SiegeIntel } from "./siegeIntel"
import { planSquad, SquadPlan, TemplateName } from "./squadMeta"

/**
 * Goal: Rank the other players' bases we've scouted by how much taking them is worth against what it would cost us,
 * and say plainly which we could take, which we couldn't and why, and where the call is close enough that the player
 * should make it (see the dashboard's conquest panel). Nothing is attacked from here: a conquest only starts once the
 * player approves it (see conquest/conquest).
 *
 * For each base (from its intel, and the siege intel that maps its walls, see conquest/siegeIntel):
 *   1. home: our base with a spawn at MIN_HOME_RCL+ nearest it by a route around hostile rooms (MAX_ROUTE at most);
 *   2. way in: for each side of the room with a breach, the room next to it on that side is where the squad gathers
 *      (staging); sides whose staging room we can't reach safely are skipped. The incoming damage there is the
 *      towers' damage at the breach plus the defenders seen in the room (DEFENDER_DAMAGE per combat part);
 *   3. squad: from the attack squad meta for the home's RCL and stored energy (see squadMeta), with healers for that
 *      damage;
 *   4. effort: ticks to dismantle the breach and then the towers and spawns, at the squad's siege rate (RETREAT_OVERHEAD
 *      more under tower fire: the squad steps out to heal), over the ticks a squad has left after the trip there:
 *      the waves of squads it takes;
 *   5. the side with the fewest waves (then the least energy) is the plan.
 * Then:
 *   reward  REWARD_PER_SOURCE a source, REWARD_PER_RCL a level (what it cost them to build), loot (energy stored /
 *           LOOT_DIVISOR), more against a player who attacked us, and more again for their last base;
 *   cost    the squads' energy (and a claimer's), times a risk factor: their safe mode charges, how they compare
 *           with us overall (all their bases we've seen, see defence/strength), defenders, stale intel, a thin
 *           healing margin;
 *   score   reward per 1000 energy of risk-adjusted cost. Bases we can take now come first, best score first.
 */

const MIN_HOME_RCL = 3
const MAX_ROUTE = 8
/** Squads travel about a room per this many ticks (full speed, a MOVE per part). */
const TICKS_PER_ROOM = 50
/** Ticks a squad loses gathering and lining up its lifetimes (see conquest/conquest rallying). */
const RALLY_TICKS = 150
const RETREAT_OVERHEAD = 1.3
export const MAX_WAVES = 3
/** Damage per tick per combat part their defenders have (between ATTACK's 30 and RANGED_ATTACK's 10). */
const DEFENDER_DAMAGE = 20
/** Base intel older than this is stale: towers and walls change. */
export const STALE_TICKS = 5000
/** Bases not seen for this long aren't assessed. */
const FORGET_TICKS = 20000
const MAX_CANDIDATES = 12
/** A CLAIM body to speed up the downgrade of their controller once the core is down. */
const CLAIMER_ENERGY = 3250

const REWARD_PER_SOURCE = 1500
const REWARD_PER_RCL = 500
const REWARD_HOSTILE = 2000
const REWARD_LAST_BASE = 3000
const LOOT_DIVISOR = 100
const LOOT_CAP = 500000

const SIDE_NAMES: { [side: number]: string } = {
  [FIND_EXIT_TOP]: "top",
  [FIND_EXIT_RIGHT]: "right",
  [FIND_EXIT_BOTTOM]: "bottom",
  [FIND_EXIT_LEFT]: "left"
}

export function sideName(side: number): string {
  return SIDE_NAMES[side] ?? `side ${side}`
}

declare global {
  interface Memory {
    /** The other players' bases ranked for conquest at the last assessment (see conquest/assessment.ts). */
    conquestCandidates?: ConquestCandidateSnapshot[]
    conquestAssessed?: number
  }
}

/** Assess every base of another player we've seen recently, and keep the ranking for the dashboard. */
export function assessConquests(): void {
  const candidates: ConquestCandidateSnapshot[] = []
  for (const [room, memory] of Object.entries(Memory.rooms ?? {})) {
    const owner = memory.intel?.controller?.owner
    if (!owner || owner === myUsername() || isAlly(owner)) continue
    if (FORGET_TICKS < Game.time - memory.intel!.tick) continue
    const candidate = assessRoom(room)
    if (candidate) candidates.push(candidate)
  }
  Memory.conquestCandidates = rank(candidates).slice(0, MAX_CANDIDATES)
  Memory.conquestAssessed = Game.time
}

/** Bases we can take first, then by score. */
export function rank(candidates: ConquestCandidateSnapshot[]): ConquestCandidateSnapshot[] {
  return candidates.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score)
}

interface Option {
  breach: Breach
  staging: string
  travel: number
  squad: SquadPlan
  incoming: number
  breachTicks: number
  razeTicks: number
  waves: number
  energy: number
}

/** The assessment of one room (see the top of this file), or null if it isn't another player's base. */
export function assessRoom(room: string, override?: TemplateName): ConquestCandidateSnapshot | null {
  const memory = Memory.rooms?.[room]
  const intel = memory?.intel
  const player = intel?.controller?.owner
  if (!intel || !player || player === myUsername()) return null

  const siege = memory.siege && memory.siege.owner === player ? memory.siege : undefined
  const intelAge = Game.time - intel.tick
  const defenders = intel.combatParts?.[player] ?? 0
  const safeModeUntil = intel.safeModeUntil && Game.time < intel.safeModeUntil ? intel.safeModeUntil : undefined
  const concerns: ConquestConcern[] = []
  const decisions: string[] = []

  const theirs = playerStrength(player)
  const ours = ourStrength()
  const base: ConquestCandidateSnapshot = {
    room,
    player,
    rcl: intel.controller!.level,
    sources: intel.sources,
    towers: intel.towers ?? 0,
    towerEnergy: intel.towerEnergy ?? 0,
    spawns: siege?.spawns.length ?? 0,
    safeModeAvailable: intel.safeModeAvailable ?? 0,
    safeModeUntil,
    defenders,
    stored: intel.storedEnergy ?? 0,
    intelAge,
    siegeAge: siege ? Game.time - siege.tick : undefined,
    sides: [],
    backdoor: false,
    incoming: 0,
    playerStrength: theirs
      ? { score: Math.round(theirs.score), bases: theirs.bases, towers: theirs.towers, stored: Math.round(theirs.stored), army: theirs.army }
      : null,
    reward: 0,
    rewardNotes: [],
    risk: 1,
    score: 0,
    feasible: false,
    verdict: "",
    concerns,
    tick: Game.time
  }

  if (isAlly(player)) return { ...base, verdict: `${player} is an ally: never attacked` }

  // Reward.
  const notes: string[] = []
  let reward = intel.sources * REWARD_PER_SOURCE + base.rcl * REWARD_PER_RCL
  notes.push(`${intel.sources} source${intel.sources === 1 ? "" : "s"}, RCL ${base.rcl}`)
  const loot = Math.min(LOOT_CAP, base.stored) / LOOT_DIVISOR
  if (0 < loot) {
    reward += loot
    notes.push(`${Math.round(base.stored / 1000)}k energy stored there`)
  }
  if (relationOf(player) === "hostile") {
    reward += REWARD_HOSTILE
    notes.push(`${player} is hostile to us`)
  }
  if (theirs && theirs.bases <= 1) {
    reward += REWARD_LAST_BASE
    notes.push(`their only base we know of: takes ${player} out`)
  }
  base.reward = Math.round(reward)
  base.rewardNotes = notes

  // Home.
  const home = nearestHome(room)
  if (!home) return { ...base, verdict: `no base of ours at RCL ${MIN_HOME_RCL}+ within ${MAX_ROUTE} rooms by a safe route` }
  base.home = home.room.name
  base.distance = home.distance
  const capacity = home.room.energyCapacityAvailable
  const stored = home.room.storage
    ? home.room.storage.store.energy + (home.room.terminal?.store.energy ?? 0)
    : null

  // Risk, from what we know of the player and the room.
  let risk = 1
  if (0 < base.safeModeAvailable) {
    risk *= 2
    concerns.push({
      tone: "bad",
      text: `${base.safeModeAvailable} safe mode charge(s) left: they can switch it on when we attack, and our squad has to leave for 20,000 ticks.`
    })
    decisions.push("they have safe mode charges")
  }
  if (theirs && 0 < ours.score) {
    const ratio = theirs.score / ours.score
    if (1 < ratio) risk *= ratio
    if (0.8 < ratio) {
      concerns.push({
        tone: "bad",
        text: `Across their ${theirs.bases} base(s) we've seen they're ${ratio.toFixed(1)}× as strong as us: expect them to hit back.`
      })
      decisions.push("they're about as strong as us overall")
    } else
      concerns.push({
        tone: "good",
        text: `Across their ${theirs.bases} base(s) we've seen they're ${ratio.toFixed(2)}× as strong as us.`
      })
  }
  if (0 < defenders) {
    risk *= 1 + defenders / 50
    concerns.push({ tone: "warn", text: `${defenders} of their combat parts were in the room when last seen.` })
  }
  if (STALE_TICKS < intelAge || !siege || STALE_TICKS < Game.time - siege.tick) {
    risk *= 1.2
    concerns.push({
      tone: "warn",
      text: siege
        ? `Intel is ${intelAge.toLocaleString()} ticks old: approving sends a scout first to check the walls and towers.`
        : "We haven't mapped its walls yet: approving sends a scout first."
    })
    decisions.push("intel needs refreshing")
  }

  if (safeModeUntil)
    return finish(base, risk, decisions, `in safe mode until tick ${safeModeUntil}: nothing can hurt it until then`)

  // Without the walls mapped, size the squad for the towers at their worst.
  if (!siege || siege.breaches.length === 0) {
    const incoming = towersArmed(intel) ? base.towers * TOWER_POWER_ATTACK : 0
    const fallback = planSquad(capacity, stored, incoming + defenders * DEFENDER_DAMAGE, defenders, override)
    base.incoming = incoming + defenders * DEFENDER_DAMAGE
    if (fallback) base.squad = squadSnapshot(fallback)
    if (siege)
      return finish(base, risk, decisions, "no way in found: walls we can't destroy (or terrain) close off the core")
    return finish(base, risk, decisions, "walls not mapped yet: needs a scout's look before a plan", fallback ?? undefined)
  }

  // Options: the best breach from each side we can reach.
  const exits = Game.map.describeExits(room) ?? {}
  const options: Option[] = []
  for (const breach of siege.breaches) {
    const staging = exits[String(breach.side) as ExitKey]
    const side: ConquestSideSnapshot = {
      side: sideName(breach.side),
      staging: staging ?? "",
      reachable: false,
      hits: breach.hits,
      barriers: breach.barriers.length,
      breachDamage: breach.breachDamage,
      backdoor: breach.barriers.length === 0
    }
    base.sides.push(side)
    if (!staging || isHostileRoom(staging)) continue
    const toStaging = staging === home.room.name ? 0 : routeLength(home.room.name, staging)
    if (toStaging === null) continue
    side.reachable = true
    const option = evaluate(breach, staging, toStaging, siege, capacity, stored, defenders, override)
    if (option) options.push(option)
  }
  if (options.length === 0) {
    const reason = base.sides.length
      ? "every side we could break in from is behind a hostile room or out of reach"
      : "no way in found"
    return finish(base, risk, decisions, reason)
  }

  options.sort(
    (a, b) =>
      Number(a.squad.healShort) - Number(b.squad.healShort) || a.waves - b.waves || a.energy - b.energy || a.travel - b.travel
  )
  const best = options[0]
  base.backdoor = options.some(o => o.breach.barriers.length === 0)
  base.incoming = best.incoming
  base.squad = squadSnapshot(best.squad)
  base.breach = {
    side: sideName(best.breach.side),
    sideConstant: best.breach.side,
    entry: best.breach.entry,
    staging: best.staging,
    barriers: best.breach.barriers,
    hits: best.breach.hits,
    breachDamage: best.breach.breachDamage,
    peakDamage: best.breach.peakDamage,
    backdoor: best.breach.barriers.length === 0
  }
  base.estimate = {
    travelTicks: best.travel,
    breachTicks: Math.round(best.breachTicks),
    razeTicks: Math.round(best.razeTicks),
    waves: best.waves,
    energy: best.energy
  }

  if (base.breach.backdoor)
    concerns.push({
      tone: "good",
      text: `Backdoor: from the ${base.breach.side} (via ${best.staging}) there's a way to their spawns with no wall or rampart in it.`
    })
  else
    concerns.push({
      tone: "info",
      text: `Weakest way in: from the ${base.breach.side} (via ${best.staging}), ${base.breach.barriers.length} barrier(s) with ${thousands(
        base.breach.hits
      )} hits together, under ${base.breach.breachDamage} tower damage a tick.`
    })
  if (best.squad.heal < best.breach.peakDamage && 0 < best.breach.peakDamage)
    concerns.push({
      tone: "warn",
      text: `Near their core the towers do up to ${best.breach.peakDamage}/tick, more than our ${best.squad.heal} healing: the squad takes the towers down first and steps out to heal when it must.`
    })
  if (!best.squad.healShort && best.squad.heal < best.incoming * 1.5 && 0 < best.incoming) {
    risk *= 1.2
    decisions.push("thin healing margin")
  }

  // Verdict.
  const squad = best.squad
  const armed = towersArmed(intel) && 0 < base.towers
  let verdict: string
  let feasible = false
  if (squad.template === "raid" && armed && 0 < best.breach.breachDamage)
    verdict = `towers would kill a raid (all our RCL ${home.room.controller!.level} base can build); needs RCL 5 for dismantler duos`
  else if (squad.healShort)
    verdict = `towers do ${best.incoming}/tick at the breach; the most healing our ${squad.template} squad can bring is ${squad.heal}/tick`
  else if (MAX_WAVES < best.waves)
    verdict = `walls too thick: ${best.waves} squads' lifetimes to break in (we send at most ${MAX_WAVES})`
  else if (squad.unaffordable) verdict = `can't afford it yet: the squad ${squad.unaffordable}`
  else {
    feasible = true
    verdict = `${best.waves} wave${best.waves === 1 ? "" : "s"} of a ${squad.template} squad, about ${thousands(best.energy)} energy, ${
      base.breach.backdoor ? `through the backdoor on the ${base.breach.side}` : `breaking in from the ${base.breach.side}`
    }`
  }
  return finish({ ...base, feasible }, risk, decisions, verdict, undefined, best.energy)
}

function finish(
  base: ConquestCandidateSnapshot,
  risk: number,
  decisions: string[],
  verdict: string,
  squad?: SquadPlan,
  energy?: number
): ConquestCandidateSnapshot {
  if (squad && !base.squad) base.squad = squadSnapshot(squad)
  const cost = energy ?? (base.squad ? base.squad.cost + CLAIMER_ENERGY : 50000)
  base.risk = +risk.toFixed(2)
  base.score = Math.round((base.reward * 1000) / Math.max(1, cost * risk))
  base.verdict = verdict
  if (decisions.length) base.needsDecision = decisions.join("; ")
  return base
}

function evaluate(
  breach: Breach,
  staging: string,
  toStaging: number,
  siege: SiegeIntel,
  capacity: number,
  stored: number | null,
  defenders: number,
  override?: TemplateName
): Option | null {
  const incoming = breach.breachDamage + defenders * DEFENDER_DAMAGE
  const squad = planSquad(capacity, stored, incoming, defenders, override)
  if (!squad) return null
  const travel = (toStaging + 1) * TICKS_PER_ROOM
  const rate = Math.max(1, squad.siegeRate)
  const overhead = 0 < incoming ? RETREAT_OVERHEAD : 1
  const breachTicks = (breach.hits / rate) * overhead
  const razeTicks = (siege.coreHits / rate) * overhead
  const lifeForWork = Math.max(100, CREEP_LIFE_TIME - travel - RALLY_TICKS)
  const waves = Math.max(1, Math.ceil((breachTicks + razeTicks + breach.length) / lifeForWork))
  return {
    breach,
    staging,
    travel,
    squad,
    incoming,
    breachTicks,
    razeTicks,
    waves,
    energy: squad.cost * waves + CLAIMER_ENERGY
  }
}

type ExitKey = keyof ExitsInformation

function towersArmed(intel: { towerEnergy?: number; storedEnergy?: number }): boolean {
  return TOWER_ENERGY_COST <= (intel.towerEnergy ?? 0) || 0 < (intel.storedEnergy ?? 0)
}

function squadSnapshot(plan: SquadPlan): ConquestSquadSnapshot {
  return {
    template: plan.template,
    members: plan.members.map(m => {
      const parts: { [part: string]: number } = {}
      for (const p of m.body) parts[p] = (parts[p] ?? 0) + 1
      return { kind: m.kind, parts, cost: m.body.reduce((sum, p) => sum + BODYPART_COST[p], 0) }
    }),
    cost: plan.cost,
    siegeRate: plan.siegeRate,
    dps: plan.dps,
    heal: plan.heal,
    hits: plan.hits,
    healShort: plan.healShort,
    unaffordable: plan.unaffordable
  }
}

/** Our base at MIN_HOME_RCL+ with a spawn nearest `room` by a safe route, the bigger one on ties. */
export function nearestHome(room: string): { room: Room; distance: number } | null {
  let best: { room: Room; distance: number } | null = null
  for (const home of Object.values(Game.rooms)) {
    if (!home.controller?.my || home.controller.level < MIN_HOME_RCL) continue
    if (home.find(FIND_MY_SPAWNS).length <= 0 || !sameMapZone(home.name, room)) continue
    if (Game.map.getRoomLinearDistance(home.name, room) > MAX_ROUTE) continue
    const distance = routeLength(home.name, room)
    if (distance === null || MAX_ROUTE < distance) continue
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && best.room.energyCapacityAvailable < home.energyCapacityAvailable)
    )
      best = { room: home, distance }
  }
  return best
}

/** Rooms from `from` to `to` around hostile rooms (`to` itself may be one); null if there's no way. */
export function routeLength(from: string, to: string): number | null {
  const route = Game.map.findRoute(from, to, {
    routeCallback: name => (name !== to && isHostileRoom(name) ? Infinity : 1)
  })
  return route === ERR_NO_PATH ? null : route.length
}

function thousands(n: number): string {
  return n < 1000 ? `${Math.round(n)}` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`
}
