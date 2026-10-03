import { surveyBase, SiegeIntel } from "conquest/siegeIntel"
import { planSquad } from "conquest/squadMeta"
import { defenderBody } from "creeps/spawn/meleeDefenderSpawnHandler"
import { myUsername } from "utils/username"

/**
 * Goal: Split a player's strength into what it can attack with and what each of its bases can hold off, in game units,
 * so a fight between one player's attack and another's base can be predicted (predictFight), both ways: our attack
 * on their bases, and theirs on ours.
 *
 * Attack (attackPower), from the bases that would send it: the best unboosted squad they can build (the squad meta of
 * conquest/squadMeta, sized to the biggest base's energy capacity, with all the healers its template allows): its
 * damage, healing and hits a tick, its siege rate (hits a tick off walls); how many such waves their stored energy
 * pays for (at least one: a base spawns from income), and how long their spawns take to turn one out; plus the army
 * already seen.
 *
 * Defence (baseDefence), of one base, from its siege intel (conquest/siegeIntel: ours surveyed live, theirs from
 * scouting): tower damage a tick where it's easiest to break in, and at the room's edge; how long the towers can keep
 * firing on their energy and income (null: indefinitely); the hits of the walls on that way in (assumed, from the RCL,
 * when the walls aren't mapped) and of the towers and spawns behind them; defenders' damage (those seen, plus one
 * full-size defender its spawns turn out once attacked); safe mode.
 *
 * Fight (predictFight): the attack has to heal what the towers and defenders deal at the breach, or failing that heal
 * what they deal at the edge while the towers run dry (if they ever do); then break the walls and the core at its
 * siege rate (WORK_OVERHEAD more under fire: it steps out to heal). The waves it can afford give it so many ticks of
 * work, after the trip there; margin = work available / work needed, so above 1 the attacker wins. Safe mode stops
 * any attack while it's on, and charges left mean the defender can stop one: the prediction says so.
 */

/** Damage a tick per combat part of a defender we've only counted parts of (between ATTACK's 30 and RANGED's 10). */
const PART_DAMAGE = 20
const WORK_OVERHEAD = 1.3
/** Ticks a wave loses gathering and lining up lifetimes before it sets out. */
const RALLY_TICKS = 150
/** Waves counted at most: past this the fight is decided by something else. */
const MAX_WAVES = 5
/** Ticks per room a squad walks. */
const TICKS_PER_ROOM = 50
/** Walls not mapped yet are assumed to be this share of the RCL's rampart maximum. */
const ASSUMED_WALL_SHARE = 0.03
/** Our bases are surveyed this often (the survey runs a search over the whole room). */
const SURVEY_TICKS = 1000

export interface BaseInfo {
  room: string
  rcl: number
  /** Energy capacity of its spawns and extensions. */
  capacity: number
  spawns: number
  /** Energy in storage and terminal. */
  stored: number
}

export interface AttackPower {
  bases: string[]
  spawns: number
  /** The biggest base's energy capacity: what the squad is built with. */
  capacity: number
  stored: number
  template: string
  members: number
  /** Energy per wave, and the ticks all the bases' spawns take to spawn one. */
  cost: number
  waveSpawnTicks: number
  dps: number
  heal: number
  hits: number
  siegeRate: number
  /** Waves their stored energy pays for (1 at least, at most MAX_WAVES). */
  waves: number
  /** Combat parts already seen out. */
  army: number
}

export interface BaseDefence {
  room: string
  owner: string
  rcl: number
  towers: number
  /** Tower damage a tick where it's easiest to break in, and at the room's edge. */
  towerDamage: number
  edgeDamage: number
  /** Ticks the towers can keep firing (null: indefinitely, their income keeps up). */
  towerEndurance: number | null
  /** Hits of the walls on the easiest way in (0: a backdoor), and whether that's assumed (walls not mapped). */
  wallHits: number
  wallsAssumed: boolean
  /** Hits of the towers and spawns, with ramparts on them. */
  coreHits: number
  /** Damage a tick from defenders: those seen, plus one full-size defender from its spawns. */
  defenderDps: number
  safeModes: number
  safeModeActive: boolean
}

export interface FightPrediction {
  attackerWins: boolean
  /** Work the attack can do / work it needs: above 1, the attacker wins. 0 when it can't even hold. */
  margin: number
  /** Ticks of squad work it would take (drain + break in + raze), null when it can't hold. */
  ticks: number | null
  /** The deciding factor, in words. */
  limit: string
}

/** A player's attack from `bases` (see the top of this file), or null if none can build a squad. */
export function attackPower(bases: BaseInfo[], army: number): AttackPower | null {
  if (bases.length <= 0) return null
  const capacity = Math.max(...bases.map(b => b.capacity))
  const spawns = bases.reduce((sum, b) => sum + b.spawns, 0)
  const stored = bases.reduce((sum, b) => sum + b.stored, 0)
  // Full size (paid as it spawns), and as many healers as the template takes: the most it could send.
  const plan = planSquad(capacity, null, Infinity, 1)
  if (!plan) return null
  const parts = plan.members.reduce((sum, m) => sum + m.body.length, 0)
  const extra = army * PART_DAMAGE
  return {
    bases: bases.map(b => b.room),
    spawns,
    capacity,
    stored,
    template: plan.template,
    members: plan.members.length,
    cost: plan.cost,
    waveSpawnTicks: Math.ceil((parts * CREEP_SPAWN_TIME) / Math.max(1, spawns)),
    dps: plan.dps + extra,
    heal: plan.heal,
    hits: plan.hits,
    siegeRate: plan.siegeRate,
    waves: Math.max(1, Math.min(MAX_WAVES, Math.floor(stored / Math.max(1, plan.cost)))),
    army
  }
}

/** One base's defence (see the top of this file), from its siege intel and what we know of its energy. */
export function baseDefence(
  room: string,
  info: BaseInfo,
  owner: string,
  siege: SiegeIntel | undefined,
  more: {
    towers: number
    towerEnergy: number
    sources: number
    defenderParts: number
    safeModes: number
    safeModeActive: boolean
  }
): BaseDefence {
  const ways = siege?.breaches ?? []
  // The easiest way in: fewest hits, then least tower damage.
  const weakest = [...ways].sort((a, b) => a.hits - b.hits || a.breachDamage - b.breachDamage)[0]
  const armed = TOWER_ENERGY_COST <= more.towerEnergy || 0 < info.stored
  const averageTower = (TOWER_POWER_ATTACK + TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)) / 2
  const towerDamage = weakest ? weakest.breachDamage : armed ? Math.round(more.towers * averageTower) : 0
  const edgeDamage = weakest?.edgeDamage ?? (armed ? Math.round(more.towers * TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)) : 0)

  const burn = more.towers * TOWER_ENERGY_COST
  const income = (more.sources * SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME
  const reserve = more.towerEnergy + info.stored
  const towerEndurance = burn <= 0 ? 0 : burn <= income ? null : Math.round(reserve / (burn - income))

  const wallsAssumed = !weakest
  const wallHits = weakest ? weakest.hits : Math.round((RAMPART_HITS_MAX[info.rcl] ?? 0) * ASSUMED_WALL_SHARE)
  const coreHits = siege?.coreHits ?? more.towers * TOWER_HITS + info.spawns * SPAWN_HITS
  const defender = info.spawns ? defenderBody(info.capacity).filter(p => p === ATTACK).length * ATTACK_POWER : 0

  return {
    room,
    owner,
    rcl: info.rcl,
    towers: more.towers,
    towerDamage,
    edgeDamage,
    towerEndurance,
    wallHits,
    wallsAssumed,
    coreHits,
    defenderDps: more.defenderParts * PART_DAMAGE + defender,
    safeModes: more.safeModes,
    safeModeActive: more.safeModeActive
  }
}

/** Who'd win: `attack` against `defence`, `rooms` away (see the top of this file). */
export function predictFight(attack: AttackPower, defence: BaseDefence, rooms: number): FightPrediction {
  if (defence.safeModeActive)
    return { attackerWins: false, margin: 0, ticks: null, limit: "in safe mode: nothing can hurt it until it ends" }

  const incoming = defence.towerDamage + defence.defenderDps
  let drain = 0
  if (attack.heal < incoming) {
    const atEdge = defence.edgeDamage + defence.defenderDps
    if (defence.towerEndurance === null || attack.heal < atEdge)
      return {
        attackerWins: false,
        margin: +(attack.heal / Math.max(1, incoming)).toFixed(2),
        ticks: null,
        limit: `their towers and defenders deal ${incoming}/tick where it's easiest to break in, more than the ${
          attack.heal
        }/tick the attack heals${
          defence.towerEndurance === null ? ", and their income keeps the towers firing" : `, and ${atEdge}/tick even at the edge`
        }`
      }
    drain = defence.towerEndurance
  }

  const overhead = 0 < incoming ? WORK_OVERHEAD : 1
  const work = ((defence.wallHits + defence.coreHits) / Math.max(1, attack.siegeRate)) * overhead
  const needed = Math.round(drain + work)
  const lifeForWork = Math.max(100, CREEP_LIFE_TIME - rooms * TICKS_PER_ROOM - RALLY_TICKS)
  const available = attack.waves * lifeForWork
  const margin = +(available / Math.max(1, needed)).toFixed(2)
  const attackerWins = needed <= available
  const how = drain ? `drains their towers (~${drain} ticks), then breaks in` : "out-heals their towers and breaks in"
  const walls = `${defence.wallsAssumed ? "~" : ""}${Math.round(defence.wallHits / 1000)}k hits of walls${
    defence.wallsAssumed ? " (assumed: not mapped)" : ""
  }`
  const limit = attackerWins
    ? `${how}: ~${needed} ticks of work against ${walls} and the core, of the ${available} its ${attack.waves} wave(s) have${
        0 < defence.safeModes ? `; unless they use safe mode (${defence.safeModes} left)` : ""
      }`
    : `${how === "out-heals their towers and breaks in" ? "holds under fire, but" : "can drain them, but"} needs ~${needed} ticks of work against ${walls} and the core, and its ${attack.waves} wave(s) have ${available}`
  return { attackerWins, margin, ticks: needed, limit }
}

/** What a base at `rcl` can hold and spawn, for players we only know by their rooms' intel. */
export function baseInfoAt(room: string, rcl: number, stored: number, spawnsSeen?: number): BaseInfo {
  const spawns = spawnsSeen ?? CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][rcl] ?? 0
  const extensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl] ?? 0
  const capacity =
    (CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][rcl] ?? 0) * SPAWN_ENERGY_CAPACITY +
    extensions * (EXTENSION_ENERGY_CAPACITY[rcl] ?? 0)
  return { room, rcl, capacity, spawns, stored }
}

/** One of our bases, as it is now. */
export function ourBaseInfo(room: Room): BaseInfo {
  return {
    room: room.name,
    rcl: room.controller?.level ?? 0,
    capacity: room.energyCapacityAvailable,
    spawns: room.find(FIND_MY_SPAWNS).length,
    stored: (room.storage?.store.energy ?? 0) + (room.terminal?.store.energy ?? 0)
  }
}

const surveys = new Map<string, { tick: number; siege: SiegeIntel | null }>()

/** One of our bases' defence, against whoever might attack it (surveyed every SURVEY_TICKS). */
export function ourBaseDefence(room: Room): BaseDefence {
  let cached = surveys.get(room.name)
  if (!cached || SURVEY_TICKS <= Game.time - cached.tick) {
    cached = { tick: Game.time, siege: surveyBase(room) }
    surveys.set(room.name, cached)
  }
  const towers = room.find(FIND_MY_STRUCTURES, { filter: (s): s is StructureTower => s.structureType === STRUCTURE_TOWER })
  const defenderParts = room
    .find(FIND_MY_CREEPS)
    .reduce((sum, c) => sum + c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK), 0)
  return baseDefence(room.name, ourBaseInfo(room), myUsername() ?? "us", cached.siege ?? undefined, {
    towers: towers.length,
    towerEnergy: towers.reduce((sum, t) => sum + t.store.energy, 0),
    sources: room.find(FIND_SOURCES).length,
    defenderParts,
    safeModes: room.controller?.safeModeAvailable ?? 0,
    safeModeActive: !!room.controller?.safeMode
  })
}
