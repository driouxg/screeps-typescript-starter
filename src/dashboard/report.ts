import { controls } from "config/controls"
import { relationOf } from "config/relations"
import { income } from "creeps/spawn/utils/economy"
import { assessThreat } from "defence/threat"
import { containerBuilt } from "remote/remoteCreeps"
import { upcomingSteps } from "structures/construction/buildOrderConstructor"
import * as creepRoles from "creeps/roles"
import { myUsername } from "utils/username"
import { DashboardSnapshot, DASHBOARD_SEGMENT, RoomSnapshot, SNAPSHOT_VERSION } from "./snapshot"

/**
 * Goal: Publish the bot's state for the dashboard (see dashboard/): every REPORT_INTERVAL ticks a compact JSON
 * snapshot (see snapshot.ts) goes into memory segment DASHBOARD_SEGMENT, which the dashboard reads through the game's
 * web API. Segments are written without being requested, and cost nothing to parse on the ticks in between.
 *
 * It's run at the end of the loop, so it sees what the tick decided; it costs a few CPU every REPORT_INTERVAL ticks.
 */
const REPORT_INTERVAL = 20
const BUILD_NEXT = 8
const REMOTE_REPORT_LINES = 40
const PROFILE_LINES = 12

/** Controller progress at the previous report, per room, to measure upgrading (lost on a global reset: no rate then). */
let previous: { tick: number; progress: { [room: string]: number } } | null = null

export function report(): void {
  if (Game.time % REPORT_INTERVAL !== 0) return
  const snapshot = build()
  RawMemory.segments[DASHBOARD_SEGMENT] = JSON.stringify(snapshot)
  const progress: { [room: string]: number } = {}
  for (const r of snapshot.rooms) progress[r.name] = totalProgress(Game.rooms[r.name])
  previous = { tick: Game.time, progress }
}

/** Controller progress so far, levels included, so a level-up doesn't read as negative progress. */
function totalProgress(room: Room | undefined): number {
  const c = room?.controller
  if (!c) return 0
  let total = c.progress
  for (let level = 1; level < c.level; level++) total += CONTROLLER_LEVELS[level] ?? 0
  return total
}

function build(): DashboardSnapshot {
  const creeps = Object.values(Game.creeps)
  const owned = Object.values(Game.rooms).filter(r => r.controller?.my)
  const remotes = Memory.remotes ?? {}
  const paused = Memory.remotePaused ?? {}

  const rooms: RoomSnapshot[] = owned.map(room => {
    const c = room.controller!
    const mine = creeps.filter(cr => cr.memory.room === room.name)
    const roles: { [role: string]: number } = {}
    for (const cr of mine) roles[cr.memory.role] = (roles[cr.memory.role] || 0) + 1
    const structures: { [type: string]: number } = {}
    for (const s of room.find(FIND_STRUCTURES)) structures[s.structureType] = (structures[s.structureType] || 0) + 1
    const stored =
      (room.storage?.store.energy ?? 0) +
      room
        .find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_CONTAINER })
        .reduce((sum, s) => sum + (s as StructureContainer).store.energy, 0)
    const was = previous?.progress[room.name]
    const threat = assessThreat(room)
    return {
      name: room.name,
      rcl: c.level,
      progress: c.progress,
      progressTotal: c.progressTotal ?? 0,
      ticksToDowngrade: c.ticksToDowngrade ?? 0,
      safeMode: c.safeMode ?? 0,
      safeModeAvailable: c.safeModeAvailable,
      energyAvailable: room.energyAvailable,
      energyCapacity: room.energyCapacityAvailable,
      storedEnergy: stored,
      spawnUse: +(room.memory.spawnUse ?? 0).toFixed(3),
      creeps: roles,
      income: +income(room).toFixed(1),
      upgradeRate:
        previous && was !== undefined ? +((totalProgress(room) - was) / (Game.time - previous.tick)).toFixed(2) : null,
      constructionSites: room.find(FIND_MY_CONSTRUCTION_SITES).length,
      structures,
      towerEnergy: room
        .find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER })
        .map(t => (t as StructureTower).store.energy),
      buildNext: upcomingSteps(room, BUILD_NEXT).map(s => ({
        type: s.structureType,
        x: s.x,
        y: s.y,
        rcl: s.rcl,
        site: s.site
      })),
      threat: { hostiles: threat.hostiles.length, damage: threat.damage }
    }
  })

  const serving = (role: string, id: string) =>
    creeps.filter(cr => cr.memory.role === role && (cr.memory as { targetSourceId?: string }).targetSourceId === id)
      .length

  const hostiles = Object.values(Game.rooms).reduce(
    (all, room) =>
      all.concat(
        room.find(FIND_HOSTILE_CREEPS).map(h => {
          const parts: { [part: string]: number } = {}
          for (const p of h.body) parts[p.type] = (parts[p.type] || 0) + 1
          return {
            room: room.name,
            owner: h.owner.username,
            relation: relationOf(h.owner.username),
            x: h.pos.x,
            y: h.pos.y,
            hits: h.hits,
            hitsMax: h.hitsMax,
            parts
          }
        })
      ),
    [] as DashboardSnapshot["hostiles"]
  )

  const profile = Object.entries(Memory.cpuProfile ?? {})
    .sort((a, b) => b[1].cpu - a[1].cpu)
    .slice(0, PROFILE_LINES)
    .map(([key, v]) => ({ key, cpu: Math.round(v.cpu), calls: v.calls, perCall: +(v.cpu / v.calls).toFixed(3) }))

  return {
    version: SNAPSHOT_VERSION,
    tick: Game.time,
    writtenAt: Date.now(),
    shard: Game.shard?.name ?? "",
    username: myUsername() ?? "",
    cpu: { used: +Game.cpu.getUsed().toFixed(2), limit: Game.cpu.limit, bucket: Game.cpu.bucket },
    gcl: {
      level: Game.gcl.level,
      progress: Math.round(Game.gcl.progress),
      progressTotal: Math.round(Game.gcl.progressTotal)
    },
    controls: controls(),
    rooms,
    remotes: Object.values(remotes).map(r => ({
      id: r.id,
      room: r.room,
      home: r.home,
      x: r.x,
      y: r.y,
      distance: r.distance,
      net: r.net,
      reserve: r.reserve,
      road: r.road,
      workParts: r.workParts,
      carryParts: r.carryParts,
      spawnLoad: r.spawnLoad,
      container: Game.rooms[r.room] ? containerBuilt(r) : null,
      paused: !!paused[r.room],
      miners: serving(creepRoles.REMOTE_MINER, r.id),
      haulers: serving(creepRoles.REMOTE_HAULER, r.id)
    })),
    remoteReport: (Memory.remoteReport ?? []).slice(0, REMOTE_REPORT_LINES),
    threats: Object.entries(Memory.remoteThreats ?? {}).map(([room, t]) => ({
      room,
      home: t.home,
      defenders: t.defenders,
      damage: t.damage,
      healing: t.healing,
      hits: t.hits,
      seen: t.seen
    })),
    hostiles,
    relations: {
      allies: Memory.allies ?? [],
      enemies: Memory.enemies ?? [],
      hostilePlayers: Memory.hostilePlayers ?? {}
    },
    expansion: Memory.expansion ?? null,
    highways: Object.entries(Memory.highways ?? {}).reduce(
      (all, [home, h]) =>
        all.concat(
          Object.entries(h.rooms).map(([room, r]) => ({
            home,
            room,
            tiles: r.tiles.length,
            missing: r.missing,
            damaged: r.damaged,
            sites: r.sites,
            lowest: +r.lowest.toFixed(2)
          }))
        ),
      [] as DashboardSnapshot["highways"]
    ),
    cpuProfile: profile
  }
}
