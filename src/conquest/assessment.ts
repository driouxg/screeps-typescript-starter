import { isAlly, relationOf } from "config/relations"
import { ourStrength, playerStrength } from "defence/strength"
import type {
  ConquestCandidateSnapshot,
  ConquestConcern,
  ConquestSideSnapshot,
  ConquestSquadSnapshot,
  ConquestSupplySnapshot
} from "dashboard/snapshot"
import type { RoomIntel } from "expansion/intel"
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
 *   1. home: our base with a spawn at MIN_HOME_RCL+ nearest it by a route around hostile rooms (MAX_ROUTE at most),
 *      and the support bases: every base of ours like it within SUPPORT_ROUTE of the target (see supportBases), which
 *      spawn the waves' members between them. The squad is sized for the biggest of them, paid for from what they
 *      have stored between them, and compared against the target's owner with only their strength (see
 *      defence/strength), not that of bases too far away to help;
 *   2. way in: for each side of the room with a breach, the room next to it on that side is where the squad gathers
 *      (staging); sides whose staging room we can't reach safely are skipped. The incoming damage there is the
 *      towers' damage at the breach plus the defenders seen in the room (DEFENDER_DAMAGE per combat part);
 *   3. squad: from the attack squad meta for the home's RCL and stored energy (see squadMeta), with healers for that
 *      damage;
 *   4. their energy (supplyOf): towers burn TOWER_ENERGY_COST a tick each while firing. Against that: the energy in
 *      their towers, storage and terminal, what their other bases could send by terminal (RCL 6+ on both ends), and
 *      their income (this room's sources, and their remotes nearby at REMOTE_SHARE). That gives how long they can keep
 *      firing (null: indefinitely), and how long with the miners we can reach killed: those of sources outside their
 *      walls (see siegeIntel exposedSources), and their remotes if we can raid them (a home at RAID_RCL+);
 *   5. strategy (see evaluate): assault if the squad out-heals the towers at the breach (slowed by their repairs on the
 *      wall while their energy lasts), else drain if it out-heals them at the room's edge and they can't keep firing
 *      forever; else nothing works;
 *   6. effort: ticks to drain, dismantle the breach and then the towers and spawns, at the squad's siege rate
 *      (RETREAT_OVERHEAD more under fire: the squad steps out to heal), over the ticks a squad has left after the trip
 *      there: the waves of squads it takes;
 *   7. the way there (wayThere): every room on the route from home to the side's staging room, and the staging
 *      room itself, is safe (seen within STALE_TICKS, no hostile owner or towers, no fighters seen lately, no keepers
 *      where the squad gathers), unknown (some of them not seen lately), or unsafe;
 *   8. the plan: a side with a working strategy, not unsafe, and a backdoor (no barriers at all) with a safe way
 *      there before anything else: walls are what we'd spend the squad's life on, and a backdoor exploits the gap.
 *      Then the fewest waves, the least energy, a known way over an unknown one, the shortest trip. A backdoor whose
 *      way there is unknown loses to a known walled side, but the rooms to check are listed (reconRooms): approving
 *      sends recon scouts there first, and the plan is made again with what they find (see conquest/conquest).
 * Except a base with nothing left to defend it (claimOnly): no spawns, no working towers, no fighters seen, and a
 * controller a creep can walk up to without breaking a wall. No squad then: claimers go straight to running its
 * controller down (strategy "claim", see claimEstimate), as long as one lives long enough to get there.
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
/**
 * Our bases within this many rooms of a target (by a safe route) help with its conquest: they spawn wave members and
 * count towards our strength there. A wave sets out together once it's all spawned and renewed, and gathers by the
 * target, so every member ages while the farthest one walks: about TICKS_PER_ROOM a room, from a creep's
 * CREEP_LIFE_TIME of 1500. From 6 rooms that's ~300 ticks, leaving 1000+ to fight after rallying; further out a
 * quarter or more of each wave's life would go on walking, and the base is worth more defending itself.
 */
export const SUPPORT_ROUTE = 6
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
/** A rough claimer cost, for scoring bases we have no plan for (planned ones count every claimer, see claimEstimate). */
const CLAIMER_ENERGY = 3250
/** A claimer must get there with this many ticks of its life to spare (CREEP_CLAIM_LIFE_TIME) to be any use. */
const CLAIMER_SLACK = 100
/** Their remotes count towards this base's income within this many rooms of it (and no nearer another of theirs). */
const REMOTE_REACH = 2
/** Share of a remote's energy that reaches the base (the rest pays for its haulers and decays on the way). */
const REMOTE_SHARE = 0.7
/** Terminals come at RCL 6. */
const TERMINAL_RCL = 6
/** A stockpile trend needs looks at least this far apart. */
const TREND_MIN_TICKS = 300
/** A squad draining towers from the room's edge must heal this much more than they do there. */
const DRAIN_HEAL_MARGIN = 1.1
/** Our homes need this RCL to raid their remotes (see defence/retaliation). */
const RAID_RCL = 4

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

type Supply = ConquestSupplySnapshot

interface Option {
  breach: Breach
  staging: string
  travel: number
  squad: SquadPlan
  incoming: number
  /** Damage per tick at the hold tile on the room's edge, defenders included. */
  edgeDamage: number
  /** Hits per tick their towers can repair on the outermost barrier. */
  repair: number
  strategy: "assault" | "drain" | "none"
  /** The way from home to the staging room (see wayThere). */
  safety: Safety
  unseen: string[]
  drainTicks: number
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
  // The bases that spawn the waves between them (see SUPPORT_ROUTE): the squad is sized for the biggest, paid for from
  // what they've stored together (null: none has storage yet, so it's spawned from income), and walks as far as the
  // farthest of them.
  const support = supportBases(room, home)
  base.supportBases = support.map(b => ({
    room: b.room.name,
    distance: b.distance,
    spawns: b.room.find(FIND_MY_SPAWNS).length,
    capacity: b.room.energyCapacityAvailable
  }))
  const capacity = Math.max(...support.map(b => b.room.energyCapacityAvailable))
  const withStorage = support.filter(b => b.room.storage)
  const stored = withStorage.length
    ? withStorage.reduce((sum, b) => sum + b.room.storage!.store.energy + (b.room.terminal?.store.energy ?? 0), 0)
    : null
  const extraTravel = (Math.max(...support.map(b => b.distance)) - home.distance) * TICKS_PER_ROOM
  const ours = ourStrength(support.map(b => b.room.name))
  base.ourStrength = { score: Math.round(ours.score), bases: ours.bases, towers: ours.towers, stored: Math.round(ours.stored), army: ours.army }
  const spawns = base.supportBases.reduce((sum, b) => sum + b.spawns, 0)
  concerns.push({
    tone: "info",
    text:
      support.length > 1
        ? `Waves spawn across ${support.length} of our bases within ${SUPPORT_ROUTE} rooms (${spawns} spawns): ${base.supportBases
            .map(b => `${b.room} (${b.distance} rooms, ${b.spawns} spawn${b.spawns === 1 ? "" : "s"})`)
            .join(", ")}.`
        : `Only ${home.room.name} is within ${SUPPORT_ROUTE} rooms to spawn waves (${spawns} spawn${spawns === 1 ? "" : "s"}).`
  })

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
        text: `Across their ${theirs.bases} base(s) we've seen they're ${ratio.toFixed(1)}× as strong as our ${ours.bases} base(s) within ${SUPPORT_ROUTE} rooms of it: expect them to hit back.`
      })
      decisions.push("they're about as strong as us overall")
    } else
      concerns.push({
        tone: "good",
        text: `Across their ${theirs.bases} base(s) we've seen they're ${ratio.toFixed(2)}× as strong as our ${ours.bases} base(s) within ${SUPPORT_ROUTE} rooms of it.`
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

  // Their energy: how long their towers can keep firing (see supplyOf).
  const supply = supplyOf(room, player, intel, siege, RAID_RCL <= (home.room.controller?.level ?? 0))
  base.supply = supply
  supplyConcerns(supply, concerns)

  // Nothing defends it: claimers alone, no squad.
  // Claimers come from the home alone (the nearest base: they live CREEP_CLAIM_LIFE_TIME).
  const claim = claimEstimate(base.rcl, intel.controller?.ticksToDowngrade, home.room.energyCapacityAvailable)
  const claimBlockers = siege ? claimOnlyBlockers(siege, intel, base.towers, defenders) : ["its walls aren't mapped yet"]
  if (siege && siege.spawns.length === 0 && claimBlockers.length)
    concerns.push({
      tone: "warn",
      text: `No spawns, but claimers alone (no squad) won't do yet: ${claimBlockers.join("; ")}.`
    })
  if (siege && claimBlockers.length === 0) {
    const travel = home.distance * TICKS_PER_ROOM
    base.estimate = {
      strategy: "claim",
      travelTicks: travel,
      drainTicks: 0,
      breachTicks: 0,
      razeTicks: 0,
      waves: 0,
      energy: claim.energy,
      edgeDamage: 0,
      breachRepair: 0,
      claimTicks: claim.ticks,
      claimParts: claim.parts
    }
    if (CREEP_CLAIM_LIFE_TIME - CLAIMER_SLACK < travel)
      return finish(
        base,
        risk,
        decisions,
        `nothing defends it, but it's ${home.distance} rooms away: a claimer (${CREEP_CLAIM_LIFE_TIME} ticks of life) can't get there`
      )
    concerns.push({
      tone: "good",
      text: `No spawns, no working towers, no fighters seen, and a claimer can walk up to the controller: no squad needed. Claimers with ${
        claim.parts
      } CLAIM part(s) each take ${claim.parts * CONTROLLER_CLAIM_DOWNGRADE} ticks off its downgrade timer every ${CONTROLLER_ATTACK_BLOCKED_UPGRADE} ticks: free in ~${claim.ticks.toLocaleString()} ticks.`
    })
    if (0 < base.safeModeAvailable)
      concerns.push({
        tone: "info",
        text: `Their safe mode charges matter less here: a controller can't switch safe mode on for ${CONTROLLER_ATTACK_BLOCKED_UPGRADE} ticks after each attack, and claimers attack again as soon as it's allowed. Their chance is before our first attack; if they take it, the conquest stops (safe mode ends it).`
      })
    return finish(
      { ...base, feasible: true },
      risk,
      decisions,
      `no squad needed: claimers run their controller down, ~${claim.ticks.toLocaleString()} ticks and ~${thousands(claim.energy)} energy`,
      undefined,
      claim.energy
    )
  }

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
    const way = wayThere(home.room.name, staging)
    if (!way) continue
    side.reachable = true
    side.safety = way.safety
    side.safetyNote = way.note
    side.unseen = way.unseen
    const option = evaluate(breach, staging, way.rooms + extraTravel / TICKS_PER_ROOM, siege, supply, capacity, stored, defenders, claim.energy, override)
    if (option) options.push({ ...option, safety: way.safety, unseen: way.unseen })
  }
  if (options.length === 0) {
    const reason = base.sides.length
      ? "every side we could break in from is behind a hostile room or out of reach"
      : "no way in found"
    return finish(base, risk, decisions, reason)
  }

  // See the top of this file (8): what works and isn't unsafe, a safe backdoor first, then the cheapest.
  const tier = (o: Option) => (o.strategy === "none" ? 2 : o.safety === "unsafe" ? 1 : 0)
  const safeBackdoor = (o: Option) => o.breach.barriers.length === 0 && o.safety === "safe"
  options.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      Number(safeBackdoor(b)) - Number(safeBackdoor(a)) ||
      a.waves - b.waves ||
      a.energy - b.energy ||
      Number(a.safety === "unknown") - Number(b.safety === "unknown") ||
      a.travel - b.travel
  )
  const best = options[0]

  // Backdoors we can't vouch for the way to: the rooms to look at before settling for walls.
  if (!safeBackdoor(best)) {
    const unverified = options.filter(o => o.breach.barriers.length === 0 && o.safety === "unknown" && o.strategy !== "none")
    const recon = [...new Set(unverified.reduce((all, o) => all.concat(o.unseen), [] as string[]))]
    if (recon.length) {
      base.reconRooms = recon
      concerns.push({
        tone: "warn",
        text: `Backdoor${unverified.length === 1 ? "" : "s"} ${unverified
          .map(o => `from the ${sideName(o.breach.side)} (via ${o.staging})`)
          .join(", ")}: no walls in the way, but we haven't seen ${recon.join(", ")} lately, so the way there isn't verified. Approving sends recon scouts first, and the plan takes the backdoor if it's safe.`
      })
      decisions.push("a backdoor needs recon")
    }
  }
  for (const o of options)
    if (o.breach.barriers.length === 0 && o.safety === "unsafe")
      concerns.push({
        tone: "bad",
        text: `Backdoor from the ${sideName(o.breach.side)} (via ${o.staging}) isn't safe to gather at: ${
          base.sides.find(x => x.staging === o.staging)?.safetyNote ?? "danger on the way"
        }.`
      })
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
    backdoor: best.breach.barriers.length === 0,
    hold: best.breach.hold
  }
  base.estimate = {
    strategy: best.strategy,
    travelTicks: best.travel,
    drainTicks: best.drainTicks,
    breachTicks: Number.isFinite(best.breachTicks) ? Math.round(best.breachTicks) : -1,
    razeTicks: Number.isFinite(best.razeTicks) ? Math.round(best.razeTicks) : -1,
    waves: Number.isFinite(best.waves) ? best.waves : -1,
    energy: Number.isFinite(best.energy) ? best.energy : -1,
    edgeDamage: best.edgeDamage,
    breachRepair: best.repair,
    claimTicks: claim.ticks,
    claimParts: claim.parts
  }
  if (best.strategy === "assault" && 0 < best.repair) {
    const outpaced = best.squad.siegeRate <= best.repair
    const lasts = supply.endurance === null ? "never, at their income" : `in ~${supply.endurance} ticks`
    concerns.push({
      tone: outpaced ? "bad" : "warn",
      text: `If their towers repair the wall instead of shooting, they restore ${best.repair} hits a tick against the ${
        best.squad.siegeRate
      } we take off: ${
        outpaced
          ? `we only get through once their energy runs out (${lasts}).`
          : "we still get through, slower (counted in the estimate)."
      }`
    })
  }
  if (best.strategy === "drain")
    concerns.push({
      tone: "warn",
      text: `We can't out-heal their towers at the breach (${best.incoming}/tick), but can at the room's edge (${
        best.edgeDamage
      }/tick): the squad holds there${
        supply.exposedSources || supply.raidRemotes ? ", killing the miners it can reach," : ""
      } until their towers run dry, ~${best.drainTicks} ticks. A bot that stops shooting to save energy would stall this.`
    })

  if (base.breach.backdoor)
    concerns.push({
      tone: "good",
      text: `Backdoor: from the ${base.breach.side} (via ${best.staging}) there's a way to their ${
        siege.spawns.length ? "spawns" : siege.towers.length ? "towers" : "controller"
      } with no wall or rampart in it${best.safety === "safe" ? ", and every room on the way there has been seen lately and is clear" : ""}.`
    })
  else
    concerns.push({
      tone: "info",
      text: `Weakest way in: from the ${base.breach.side} (via ${best.staging}), ${base.breach.barriers.length} barrier(s) with ${thousands(
        base.breach.hits
      )} hits together, under ${base.breach.breachDamage} tower damage a tick.`
    })
  // (Not when draining: by the time the squad reaches the core, their towers are dry.)
  if (best.strategy === "assault" && best.squad.heal < best.breach.peakDamage && 0 < best.breach.peakDamage)
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
  if (best.strategy === "none" && armed) {
    if (squad.heal < best.edgeDamage * DRAIN_HEAL_MARGIN)
      verdict = `towers do ${best.incoming}/tick at the breach and ${best.edgeDamage}/tick even at the room's edge; the most our ${squad.template} squad heals is ${squad.heal}/tick`
    else
      verdict = `towers do ${best.incoming}/tick at the breach (we heal ${squad.heal}), and they can't be drained: their income (${
        supply.starvedIncome
      }/tick after we kill what miners we can reach${
        supply.networkBases ? `, plus terminal supply from ${supply.networkBases} base(s)` : ""
      }) keeps up with the ${supply.burn}/tick their towers burn`
  } else if (best.strategy === "assault" && !Number.isFinite(best.breachTicks))
    verdict = `their towers repair the wall (${best.repair}/tick) faster than we take it down (${squad.siegeRate}/tick), and their income keeps them going`
  else if (best.strategy === "none")
    verdict = `the most healing our ${squad.template} squad can bring (${squad.heal}/tick) can't hold against ${best.incoming}/tick`
  else if (MAX_WAVES < best.waves)
    verdict =
      best.drainTicks > best.breachTicks
        ? `their energy outlasts us: draining their towers takes ~${best.drainTicks.toLocaleString()} ticks${
            supply.networkBases ? " (other bases can send them energy by terminal)" : ""
          }, ${best.waves} squads' lifetimes (we send at most ${MAX_WAVES})`
        : `walls too thick: ${best.waves} squads' lifetimes to break in (we send at most ${MAX_WAVES})`
  else if (squad.unaffordable) verdict = `can't afford it yet: the squad ${squad.unaffordable}`
  else {
    feasible = true
    verdict = `${best.waves} wave${best.waves === 1 ? "" : "s"} of a ${squad.template} squad, about ${thousands(best.energy)} energy, ${
      best.strategy === "drain" ? `draining their towers (~${best.drainTicks} ticks) then ` : ""
    }${
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
  const cost =
    energy !== undefined && Number.isFinite(energy)
      ? energy
      : base.squad
      ? base.squad.cost * MAX_WAVES + CLAIMER_ENERGY
      : 50000
  base.risk = +risk.toFixed(2)
  base.score = Math.round((base.reward * 1000) / Math.max(1, cost * risk))
  base.verdict = verdict
  if (decisions.length) base.needsDecision = decisions.join("; ")
  return base
}

/**
 * Why a base can't be taken by claimers alone (see the top of this file), or nothing if it can. A map recorded before
 * siege intel checked the controller (no controllerOpen) is read from its breaches: with no spawns or towers they lead
 * to the controller, so one with no barriers means a claimer can walk up to it.
 */
function claimOnlyBlockers(siege: SiegeIntel, intel: RoomIntel, towers: number, defenders: number): string[] {
  const why: string[] = []
  if (siege.spawns.length) why.push(`${siege.spawns.length} spawn(s)`)
  if (towers && towersArmed(intel)) why.push(`${towers} tower(s) with energy to fire, or stored energy to refill them`)
  if (defenders) why.push(`${defenders} of their combat parts seen in the room`)
  else if (intel.hostileFighters)
    why.push(`${intel.hostileFighters} hostile fighter(s) (invaders, or a player at war with us) seen in the room`)
  const open =
    siege.controllerOpen ??
    (siege.spawns.length === 0 && siege.towers.length === 0 && siege.breaches.some(b => b.barriers.length === 0))
  if (!open) why.push("walls or ramparts close off the controller")
  return why
}

/**
 * How long claimers from a home with `capacity` take to free a controller at `level` (`ticksToDowngrade` left when
 * seen, the level's full timer if unknown): its timer runs down a tick a tick, and each attack (one every
 * CONTROLLER_ATTACK_BLOCKED_UPGRADE ticks, a claimer each: they live CREEP_CLAIM_LIFE_TIME) takes
 * CONTROLLER_CLAIM_DOWNGRADE more per CLAIM part. A controller that downgrades a level restarts at about half that
 * level's timer, so the lower levels add half theirs: an estimate, not exact.
 */
function claimEstimate(
  level: number,
  ticksToDowngrade: number | undefined,
  capacity: number
): { ticks: number; parts: number; energy: number } {
  const pair = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
  const parts = Math.max(1, Math.min(Math.floor(MAX_CREEP_SIZE / 2), Math.floor(capacity / pair)))
  let total = ticksToDowngrade ?? CONTROLLER_DOWNGRADE[level] ?? 0
  for (let l = level - 1; 1 <= l; l--) total += (CONTROLLER_DOWNGRADE[l] ?? 0) / 2
  const ticks = Math.round(total / (1 + (parts * CONTROLLER_CLAIM_DOWNGRADE) / CONTROLLER_ATTACK_BLOCKED_UPGRADE))
  const claimers = Math.max(1, Math.ceil(ticks / CONTROLLER_ATTACK_BLOCKED_UPGRADE))
  return { ticks, parts, energy: claimers * parts * pair }
}

/** What their energy means for a siege, for the dashboard. */
function supplyConcerns(s: Supply, concerns: ConquestConcern[]): void {
  if (s.burn <= 0) return
  const lasts = (t: number | null) => (t === null ? "indefinitely" : `~${t.toLocaleString()} ticks`)
  const remotes = s.remoteSources ? `, ${s.remoteSources} in remotes ${s.remoteRooms.join(", ")}` : ""
  const network = s.networkStored ? `, ${thousands(s.networkStored)} in other bases` : ""
  concerns.push({
    tone: s.endurance === null ? "bad" : "info",
    text: `Firing every tick their towers burn ${s.burn} energy/tick. They have ${thousands(s.reserve)} to burn (${thousands(
      s.towerEnergy
    )} in towers, ${thousands(s.stored)} stored${network}) and bring in ~${s.income}/tick (${
      s.baseSources
    } source(s) here${remotes}): they can keep firing ${lasts(s.endurance)}.`
  })
  if (s.exposedSources || s.raidRemotes) {
    const how = [
      s.exposedSources ? `${s.exposedSources} source(s) here are outside their walls, in reach of our squad` : "",
      s.raidRemotes ? `their remotes (${s.remoteRooms.join(", ")}) get raided while we drain (see retaliation)` : ""
    ]
      .filter(Boolean)
      .join("; ")
    concerns.push({
      tone: "good",
      text: `Their miners can be picked off: ${how}. That cuts their income to ~${s.starvedIncome}/tick: towers last ${lasts(
        s.enduranceStarved
      )}.`
    })
  } else
    concerns.push({ tone: "info", text: "Their miners are all behind their walls: we can't starve them by killing miners." })
  if (s.networkBases)
    concerns.push({
      tone: "warn",
      text: `They have a terminal and ${s.networkBases} other base(s) with terminals (${thousands(
        s.networkStored
      )} stored), so energy can be sent in: counted in what they can burn, and starving them takes that much longer.`
    })
  if (s.trend !== undefined && Math.abs(s.trend) >= 1)
    concerns.push({
      tone: s.trend > 0 ? "warn" : "good",
      text:
        s.trend > 0
          ? `Their stockpile grew ${s.trend}/tick between our last looks: it's being filled (remotes, or sent from another base).`
          : `Their stockpile shrank ${-s.trend}/tick between our last looks: they're spending more than they bring in.`
    })
}

/**
 * How long their towers can keep firing (see the top of this file): their energy (in the towers, storage and
 * terminal, plus what their other bases could send by terminal) against what firing every tick burns, less what
 * their sources and remotes bring in; and the same with the miners we can reach killed.
 */
function supplyOf(room: string, player: string, intel: RoomIntel, siege: SiegeIntel | undefined, raidRemotes: boolean): Supply {
  const towers = intel.towers ?? 0
  const burn = towers * TOWER_ENERGY_COST
  const perSource = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME
  const baseIncome = intel.sources * perSource

  // Their remotes: rooms they reserve nearer this base than any other of theirs.
  const bases: string[] = []
  const remotes: { room: string; sources: number }[] = []
  for (const [name, memory] of Object.entries(Memory.rooms ?? {})) {
    const other = memory.intel
    if (!other || FORGET_TICKS < Game.time - other.tick) continue
    if (other.controller?.owner === player && name !== room) bases.push(name)
    if (other.controller?.reservedBy === player && !other.controller.owner) remotes.push({ room: name, sources: other.sources })
  }
  const near = (r: string) => {
    const d = Game.map.getRoomLinearDistance(r, room)
    return d <= REMOTE_REACH && bases.every(b => d <= Game.map.getRoomLinearDistance(r, b))
  }
  const theirRemotes = remotes.filter(r => near(r.room))
  const remoteSources = theirRemotes.reduce((sum, r) => sum + r.sources, 0)
  const remoteIncome = remoteSources * perSource * REMOTE_SHARE
  const income = baseIncome + remoteIncome
  const exposedSources = siege?.exposedSources ?? 0
  const exposedIncome = exposedSources * perSource + (raidRemotes ? remoteIncome : 0)

  // Their other bases that can send energy by terminal (RCL 6+), if this one has a terminal.
  const hasTerminal = intel.terminal ?? (intel.controller?.level ?? 0) >= TERMINAL_RCL
  const senders = hasTerminal
    ? bases.filter(b => (Memory.rooms[b].intel?.controller?.level ?? 0) >= TERMINAL_RCL)
    : []
  const networkStored = senders.reduce((sum, b) => sum + (Memory.rooms[b].intel?.storedEnergy ?? 0), 0)

  const towerEnergy = intel.towerEnergy ?? 0
  const stored = intel.storedEnergy ?? 0
  const reserve = towerEnergy + stored + networkStored
  const endurance = (gain: number): number | null => (burn <= gain ? null : Math.round(reserve / (burn - gain)))

  let trend: number | undefined
  const before = intel.storedBefore
  if (before && TREND_MIN_TICKS <= intel.tick - before.tick)
    trend = +((stored - before.energy) / (intel.tick - before.tick)).toFixed(1)

  return {
    towerEnergy,
    stored,
    networkStored,
    networkBases: senders.length,
    reserve,
    burn,
    income: +income.toFixed(1),
    baseSources: intel.sources,
    remoteSources,
    remoteRooms: theirRemotes.map(r => r.room),
    exposedSources,
    raidRemotes: raidRemotes && 0 < remoteSources,
    starvedIncome: +Math.max(0, income - exposedIncome).toFixed(1),
    endurance: towers ? endurance(income) : 0,
    enduranceStarved: towers ? endurance(income - exposedIncome) : 0,
    trend
  }
}

/**
 * The best plan through one breach:
 *   assault  the squad heals what the towers do at the breach: it dismantles its way in. If the towers repair the
 *            barrier instead of shooting (the smart answer to a squad they can't hurt), they take breachRepair a tick
 *            off our rate for as long as their energy lasts (supply.endurance); after that, our full rate.
 *   drain    it can't heal that, but can heal what they do at the room's edge (the hold tile): it stands there, and
 *            kills the miners it can reach, until their towers run dry (supply.enduranceStarved), then breaks in.
 *   none     neither: the towers win.
 */
function evaluate(
  breach: Breach,
  staging: string,
  toStaging: number,
  siege: SiegeIntel,
  supply: Supply,
  capacity: number,
  stored: number | null,
  defenders: number,
  /** The claimers to run their controller down once the core is down (see claimEstimate). */
  claimEnergy: number,
  override?: TemplateName
): Omit<Option, "safety" | "unseen"> | null {
  const defenderDamage = defenders * DEFENDER_DAMAGE
  const incoming = breach.breachDamage + defenderDamage
  // Dismantlers can't hurt creeps: with miners outside their walls to kill, bring a ranged escort.
  const squad = planSquad(capacity, stored, incoming, Math.max(defenders, supply.exposedSources ? 1 : 0), override)
  if (!squad) return null
  const travel = (toStaging + 1) * TICKS_PER_ROOM
  const rate = Math.max(1, squad.siegeRate)
  const lifeForWork = Math.max(100, CREEP_LIFE_TIME - travel - RALLY_TICKS)
  const edgeDamage = (breach.edgeDamage ?? breach.breachDamage) + defenderDamage
  const repair = breach.breachRepair ?? 0

  let strategy: Option["strategy"] = "none"
  let drainTicks = 0
  let breachTicks = Infinity
  let razeTicks = Infinity
  if (!squad.healShort) {
    strategy = "assault"
    const overhead = 0 < incoming ? RETREAT_OVERHEAD : 1
    const net = rate - repair
    const lasts = supply.endurance
    if (repair <= 0 || (0 < net && (lasts === null || breach.hits <= net * lasts))) breachTicks = breach.hits / Math.max(1, net)
    else if (lasts !== null) breachTicks = lasts + (breach.hits - Math.max(0, net) * lasts) / rate
    breachTicks *= overhead
    razeTicks = (siege.coreHits / rate) * overhead
  } else if (edgeDamage * DRAIN_HEAL_MARGIN <= squad.heal && supply.enduranceStarved !== null) {
    strategy = "drain"
    drainTicks = supply.enduranceStarved
    // Dry towers: only defenders left to heal through.
    const overhead = 0 < defenderDamage ? RETREAT_OVERHEAD : 1
    breachTicks = (breach.hits / rate) * overhead
    razeTicks = (siege.coreHits / rate) * overhead
  }

  const work = drainTicks + breachTicks + razeTicks + breach.length
  const waves = Number.isFinite(work) ? Math.max(1, Math.ceil(work / lifeForWork)) : Infinity
  return {
    breach,
    staging,
    travel,
    squad,
    incoming,
    edgeDamage,
    repair,
    strategy,
    drainTicks,
    breachTicks,
    razeTicks,
    waves,
    energy: Number.isFinite(waves) ? squad.cost * waves + claimEnergy : Infinity
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

/**
 * The bases that help conquer `room` (see SUPPORT_ROUTE): `home`, and every other base of ours at MIN_HOME_RCL+ with
 * a spawn within SUPPORT_ROUTE of it by a safe route; nearest first.
 */
export function supportBases(
  room: string,
  home: { room: Room; distance: number }
): { room: Room; distance: number }[] {
  const bases = [home]
  for (const base of Object.values(Game.rooms)) {
    if (base.name === home.room.name || !base.controller?.my || base.controller.level < MIN_HOME_RCL) continue
    if (base.find(FIND_MY_SPAWNS).length <= 0 || !sameMapZone(base.name, room)) continue
    if (Game.map.getRoomLinearDistance(base.name, room) > SUPPORT_ROUTE) continue
    const distance = routeLength(base.name, room)
    if (distance !== null && distance <= SUPPORT_ROUTE) bases.push({ room: base, distance })
  }
  return bases.sort((a, b) => a.distance - b.distance)
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

type Safety = "safe" | "unknown" | "unsafe"

/** Fighters seen in a room on the way this recently make it unsafe. */
const FIGHTERS_FRESH = 1500

/**
 * The way from `home` to a side's `staging` room, where the squad gathers (see the top of this file, 7): its length
 * in rooms, and whether it's safe (every room on it seen within STALE_TICKS and clear), unknown (with the rooms not
 * seen lately), or unsafe (and why). Our own bases count as seen. Null if there's no route around hostile rooms.
 */
export function wayThere(
  home: string,
  staging: string
): { rooms: number; safety: Safety; note: string; unseen: string[] } | null {
  if (staging === home) return { rooms: 0, safety: "safe", note: "", unseen: [] }
  const route = Game.map.findRoute(home, staging, {
    routeCallback: name => (name !== staging && isHostileRoom(name) ? Infinity : 1)
  })
  if (route === ERR_NO_PATH) return null
  const me = myUsername()
  const unseen: string[] = []
  const dangers: string[] = []
  for (const { room: name } of route) {
    if (Game.rooms[name]?.controller?.my) continue
    const intel = Memory.rooms[name]?.intel
    const age = intel ? Game.time - intel.tick : Infinity
    if (!intel || STALE_TICKS < age) {
      unseen.push(name)
      continue
    }
    const owner = intel.controller?.owner
    if (owner && owner !== me && !isAlly(owner) && 0 < (intel.towers ?? 0)) dangers.push(`${name} has ${owner}'s towers`)
    else if (0 < intel.hostileFighters && age < FIGHTERS_FRESH)
      dangers.push(`hostile fighters were in ${name} ${age} ticks ago`)
    else if (name === staging && 0 < (intel.keeperLairs ?? 0)) dangers.push(`${name} has source keepers`)
  }
  const safety: Safety = dangers.length ? "unsafe" : unseen.length ? "unknown" : "safe"
  const note = dangers.length
    ? dangers.join("; ")
    : unseen.length
    ? `not seen lately: ${unseen.join(", ")}`
    : "every room on the way seen lately and clear"
  return { rooms: route.length, safety, note, unseen }
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
