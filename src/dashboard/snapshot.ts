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
  /** The strike on a player who attacked us (see src/defence/retaliation.ts), while it lasts or how it ended. */
  retaliation?: RetaliationSnapshot | null
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
