/**
 * The bot's state as written for the dashboard (see report.ts) and read by it (dashboard/). Plain types only, no game
 * globals, so the dashboard can import this file as is.
 */

export const DASHBOARD_SEGMENT = 90
export const SNAPSHOT_VERSION = 1

export type AggressionLevel = "passive" | "defensive" | "aggressive"

/** See src/defence/strength.ts: score in energy-like points, and what it's made of. */
export interface StrengthSnapshot {
  score: number
  bases: number
  towers: number
  stored: number
  /** Combat parts seen at once. */
  army: number
}

export interface ContestSnapshot {
  room: string
  player: string
  home: string
  status: string
  started: number
  /** Picked from the dashboard. */
  manual: boolean
}

export interface ContestCandidateSnapshot {
  room: string
  player: string
  home: string
  /** What the planner decided, e.g. "reserved by X: their strength ... vs ours ..., not contested". */
  verdict: string
  ally: boolean
  /** The reserving player's strength; null if none of their bases has been seen. */
  strength: StrengthSnapshot | null
  /** Tick the planner looked. */
  tick: number
}

export interface EnemySnapshot {
  player: string
  /** Tick they were flagged for attacking us, if they were. */
  flaggedSince?: number
  /** Declared an enemy (config or Memory.enemies). */
  declared: boolean
  /** Null: none of their bases seen recently, so unknown. */
  strength: StrengthSnapshot | null
  /** Most of their combat parts seen in one room at once. */
  combatParts: number
  /** Last tick we saw any room of theirs. */
  lastSeen?: number
  rooms: {
    room: string
    kind: "base" | "remote" | "army seen"
    rcl?: number
    towers?: number
    towerEnergy?: number
    /** Tick their safe mode ends, while it's on. */
    safeModeUntil?: number
    safeModeAvailable?: number
    stored?: number
    combatParts?: number
    /** Tick the room was last seen. */
    seen: number
  }[]
}

/** One attack on us (repeats merged), see src/defence/aggressionLog.ts. */
export interface AggressionIncidentSnapshot {
  tick: number
  lastTick: number
  room: string
  /** "our base", "their remote", "Bob's base", "an unclaimed room". */
  where: string
  /** ours, theirs or elsewhere. */
  zone: string
  /** "tower", or "creep: 4 ATTACK, 4 MOVE". */
  attacker: string
  /** "our REMOTE_MINER", "our spawn". */
  target: string
  /** melee, ranged, mass ranged, dismantle, hit back, controller attack, nuke. */
  how: string
  damage: number
  hits: number
  killed: number
  /** Why it may not have been aggression on their part. */
  provoked?: string
}

/** What a player has done to us, to judge whether to keep them flagged hostile. */
export interface AggressionSnapshot {
  player: string
  relation: string
  /** Tick flagged hostile, while flagged. */
  flagged?: number
  /** What got them flagged. */
  flaggedFor?: string
  first: number
  last: number
  damage: number
  killed: number
  hits: number
  /** Incidents in our rooms, theirs, elsewhere; and those in our rooms we did nothing to bring on. */
  inOurs: number
  inTheirs: number
  elsewhere: number
  unprovokedOurs: number
  /** The bot's reading of it. */
  verdict: { tone: "good" | "warn" | "bad"; text: string }
  /** Newest first. */
  incidents: AggressionIncidentSnapshot[]
}

export interface RetaliationSnapshot {
  player: string
  /** planning, spawning, attacking, or over (status says how it ended). */
  state: string
  status?: string
  target?: string
  home?: string
  /** Squad creeps alive. */
  squad: number
}

/** A reason for or against a conquest, for the dashboard (see src/conquest/assessment.ts). */
export interface ConquestConcern {
  tone: "good" | "warn" | "bad" | "info"
  text: string
}

/** The best way into a base from one side of its room. */
export interface ConquestSideSnapshot {
  side: string
  /** The room next to it on that side, where the squad gathers. */
  staging: string
  /** Whether we can get to the staging room by a safe route. */
  reachable: boolean
  hits: number
  barriers: number
  breachDamage: number
  backdoor: boolean
}

export interface ConquestBreachSnapshot {
  side: string
  /** FIND_EXIT_* of the side. */
  sideConstant: number
  entry: { x: number; y: number }
  staging: string
  /** Outermost first. */
  barriers: { x: number; y: number; hits: number; type: string }[]
  hits: number
  /** Tower damage per tick where the squad breaks in, and at worst on the way to the core. */
  breachDamage: number
  peakDamage: number
  /** No walls or ramparts between that side and their spawns. */
  backdoor: boolean
  /** Where the squad holds to drain their towers (the edge tile they hit least). */
  hold?: { x: number; y: number }
}

export interface ConquestSquadSnapshot {
  /** The attack squad meta template (see src/conquest/squadMeta.ts). */
  template: string
  members: { kind: string; parts: { [part: string]: number }; cost: number }[]
  cost: number
  /** Hits per tick off structures. */
  siegeRate: number
  dps: number
  heal: number
  hits: number
  healShort: boolean
  unaffordable?: string
}

/**
 * Their energy against what their towers burn (see supplyOf in src/conquest/assessment.ts): how long they can keep
 * firing, and how long if we kill the miners we can reach.
 */
export interface ConquestSupplySnapshot {
  towerEnergy: number
  /** In its storage and terminal. */
  stored: number
  /** In their other bases that can send it by terminal, and how many of those. */
  networkStored: number
  networkBases: number
  /** All they can burn. */
  reserve: number
  /** Energy per tick their towers use firing every tick. */
  burn: number
  /** Energy per tick from this base's sources and its remotes. */
  income: number
  baseSources: number
  remoteSources: number
  remoteRooms: string[]
  /** Sources here whose miners we can shoot from outside their walls. */
  exposedSources: number
  /** Whether we'd raid their remotes while draining (a home of ours at RCL 4+). */
  raidRemotes: boolean
  /** Income with the miners we can reach killed. */
  starvedIncome: number
  /** Ticks their towers can keep firing (null: indefinitely, their income keeps up). */
  endurance: number | null
  enduranceStarved: number | null
  /** Stored energy per tick between our last two looks (+ filling, - spending). */
  trend?: number
}

/** Another player's base, assessed for conquest (see src/conquest/assessment.ts). */
export interface ConquestCandidateSnapshot {
  room: string
  player: string
  /** Our base that would send the squad, and how many rooms away. */
  home?: string
  distance?: number
  rcl: number
  sources: number
  towers: number
  towerEnergy: number
  spawns: number
  safeModeAvailable: number
  safeModeUntil?: number
  /** Their combat parts seen in the room. */
  defenders: number
  /** Energy in its storage and terminal. */
  stored: number
  /** Ticks since we last saw it, and since its walls were mapped. */
  intelAge: number
  siegeAge?: number
  /** The best way in from each side. */
  sides: ConquestSideSnapshot[]
  /** The way in the plan uses. */
  breach?: ConquestBreachSnapshot
  /** A side with no walls in the way. */
  backdoor: boolean
  squad?: ConquestSquadSnapshot
  /** Damage per tick the squad takes while breaking in: towers and defenders. */
  incoming: number
  /** Their energy and how long their towers can keep firing on it. */
  supply?: ConquestSupplySnapshot
  /**
   * The plan: assault (out-heal the towers and break in), drain (hold at the edge until their towers run dry, then
   * break in), or claim (nothing defends it: no squad, claimers run the controller down); none if nothing works. Ticks
   * of each part, -1 where it never ends.
   */
  estimate?: {
    strategy: "assault" | "drain" | "claim" | "none"
    travelTicks: number
    drainTicks: number
    breachTicks: number
    razeTicks: number
    waves: number
    energy: number
    /** Tower (and defender) damage per tick where the squad holds to drain, and their repair on the wall. */
    edgeDamage: number
    breachRepair: number
    /** Ticks for claimers to run their controller down once nothing defends it, and the CLAIM parts each brings. */
    claimTicks?: number
    claimParts?: number
  }
  /** The owner's strength over all their bases we've seen; null if unknown. */
  playerStrength: StrengthSnapshot | null
  reward: number
  rewardNotes: string[]
  /** Cost multiplier for what could go wrong (1 = nothing known). */
  risk: number
  /** Reward per 1000 energy of risk-adjusted cost; higher is better. */
  score: number
  /** Whether the bot thinks it can take it now. */
  feasible: boolean
  verdict: string
  concerns: ConquestConcern[]
  /** Why the bot isn't sure and would like the player to decide. */
  needsDecision?: string
  tick: number
}

/** The conquest underway, or how the last one ended (see src/conquest/conquest.ts). */
export interface ConquestSnapshot {
  room: string
  player: string
  home: string
  staging: string
  side: string
  /** scouting, awaiting, staging, rallying, marching, engaged, or over. */
  state: string
  /** drain, breach, raze or claim. */
  phase: string
  /** assault, drain their towers from the edge first, or claim (no squad needed). */
  strategy?: string
  /** Energy left in their towers when last seen. */
  towerEnergy?: number
  status: string
  template: string
  wave: number
  maxWaves: number
  approved: number
  forced: boolean
  retreating: boolean
  /** Barriers left on the way in. */
  barriersLeft?: number
  squad: { name: string; kind: string; wave: number; ttl: number; hits: number; hitsMax: number; room: string }[]
  /** How it ended, when over. */
  result?: string
}

export interface ConquestTemplateSnapshot {
  name: string
  description: string
  minCapacity: number
}

export interface ControlsSnapshot {
  aggression: AggressionLevel
  remoteMining: boolean
  expansion: boolean
  scouting: boolean
}

export interface RoomSnapshot {
  name: string
  rcl: number
  progress: number
  progressTotal: number
  ticksToDowngrade: number
  safeMode: number
  safeModeAvailable: number
  /** Whether its build plan is drawn in the game (see ConstructionSiteVisualizer). */
  buildPlanOverlay?: boolean
  /** Whether its highway plan is drawn in the game (see remote/highwayVisualizer). */
  highwayOverlay?: boolean
  energyAvailable: number
  energyCapacity: number
  storedEnergy: number
  /** Share of time the spawns were busy (0-1), averaged over ~300 ticks. */
  spawnUse: number
  creeps: { [role: string]: number }
  /** Energy per tick the room's miners (and remote miners) can harvest, from their WORK parts. */
  income: number
  /** Measured since the last report: controller progress per tick. */
  upgradeRate: number | null
  constructionSites: number
  structures: { [type: string]: number }
  towerEnergy: number[]
  /** Next steps of the build order: type, position, the RCL it needs, whether its site is placed. */
  buildNext: { type: string; x: number; y: number; rcl: number; site: boolean }[]
  /** Hostile fighters in the room now: count and damage per tick. */
  threat: { hostiles: number; damage: number }
}

export interface RemoteSnapshot {
  id: string
  room: string
  home: string
  x: number
  y: number
  distance: number
  net: number
  reserve: boolean
  /** In a base we razed whose controller is still theirs: mined without a container. */
  owned?: boolean
  road: boolean
  workParts: number
  carryParts: number
  spawnLoad: number
  /** Whether the miner's container is built; null when we can't see the room. */
  container: boolean | null
  paused: boolean
  miners: number
  haulers: number
}

export interface ThreatSnapshot {
  room: string
  home: string
  defenders: number
  damage: number
  healing: number
  hits: number
  seen: number
}

export interface HostileSnapshot {
  room: string
  owner: string
  relation: string
  x: number
  y: number
  hits: number
  hitsMax: number
  parts: { [part: string]: number }
}

export interface ExpansionCandidateSnapshot {
  room: string
  home: string
  score: number
  sources: number
  /** Rooms away from home by route. */
  distance: number
}

export interface DashboardSnapshot {
  version: number
  tick: number
  /** Real time the snapshot was written (ms since epoch). */
  writtenAt: number
  shard: string
  username: string
  cpu: { used: number; limit: number; bucket: number }
  gcl: { level: number; progress: number; progressTotal: number }
  controls: ControlsSnapshot
  rooms: RoomSnapshot[]
  remotes: RemoteSnapshot[]
  /** Why each candidate remote source was or wasn't chosen at the last plan. */
  remoteReport: string[]
  threats: ThreatSnapshot[]
  hostiles: HostileSnapshot[]
  relations: { allies: string[]; enemies: string[]; hostilePlayers: { [username: string]: number } }
  /** What each player has done to us (see src/defence/aggressionLog.ts), flagged ones first. */
  aggression?: AggressionSnapshot[]
  /** The strike on a player who attacked us (see src/defence/retaliation.ts), while it lasts or how it ended. */
  retaliation?: RetaliationSnapshot | null
  /** Rooms the player asked to scout (see src/expansion/scoutRequests.ts), and how it's going. */
  scoutRequests?: { room: string; home?: string; status: string; done: boolean }[]
  /** Remote rooms we're taking from another player (see src/remote/contest.ts). */
  contests?: ContestSnapshot[]
  /** Rooms in reach the last plan saw reserved by someone else, and what it decided. */
  contestCandidates?: ContestCandidateSnapshot[]
  /** The player's last contest pick (or call-off), and what the bot made of it. */
  contestRequest?: { room: string; cancel?: boolean; status?: string; done?: boolean } | null
  /** Other players' bases ranked for conquest, best first (see src/conquest/assessment.ts), and when. */
  conquestCandidates?: ConquestCandidateSnapshot[]
  conquestAssessed?: number
  /** The conquest underway (see src/conquest/conquest.ts), or how the last one ended. */
  conquest?: ConquestSnapshot | null
  /** The player's last approval (or call-off), and what the bot made of it. */
  conquestRequest?: { room: string; action: string; status?: string; done?: boolean } | null
  /** The attack squad meta the dashboard can pick from. */
  conquestTemplates?: ConquestTemplateSnapshot[]
  /** Our strength, to compare with each enemy's (see src/defence/strength.ts). */
  ourStrength?: StrengthSnapshot
  /** What we know about each hostile player (see src/dashboard/enemyReport.ts). */
  enemies?: EnemySnapshot[]
  expansion: { target: string; home: string; state: string; started: number; manual?: boolean } | null
  /** Rooms the bot would expand to, best first (one per room, from its best home). */
  expansionCandidates?: ExpansionCandidateSnapshot[]
  /** Whether one-source rooms are candidates: no two-source room is known anywhere near. */
  expansionSingleSource?: boolean
  /** The player's pick (or cancel) from the dashboard, not yet acted on, and why. */
  expansionRequest?: { target?: string; cancel?: boolean; status?: string } | null
  /** Bases being torn down, and how far along. */
  abandoning?: { room: string; status: string }[]
  highways: {
    home: string
    room: string
    tiles: number
    missing: number
    damaged: number
    sites: number
    lowest: number
  }[]
  /**
   * CPU per creep role / loop phase, when profiling is on (Memory.cpuProfile). perTick: its total over the ticks
   * profiled (for a role, all its creeps together).
   */
  cpuProfile: { key: string; cpu: number; calls: number; perCall: number; perTick?: number }[]
}
