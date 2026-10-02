/**
 * The bot's state as written for the dashboard (see report.ts) and read by it (dashboard/). Plain types only, no game
 * globals, so the dashboard can import this file as is.
 */

export const DASHBOARD_SEGMENT = 90
export const SNAPSHOT_VERSION = 1

export type AggressionLevel = "passive" | "defensive" | "aggressive"

export interface ControlsSnapshot {
  aggression: AggressionLevel
  remoteMining: boolean
  expansion: boolean
}

export interface RoomSnapshot {
  name: string
  rcl: number
  progress: number
  progressTotal: number
  ticksToDowngrade: number
  safeMode: number
  safeModeAvailable: number
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
  expansion: { target: string; home: string; state: string; started: number } | null
  highways: {
    home: string
    room: string
    tiles: number
    missing: number
    damaged: number
    sites: number
    lowest: number
  }[]
  /** CPU per creep role / loop phase, when profiling is on (Memory.cpuProfile). */
  cpuProfile: { key: string; cpu: number; calls: number; perCall: number }[]
}
