import { isAlly } from "config/relations"
import { myUsername } from "utils/username"

/**
 * Goal: Know how to get into another player's base without vision: where its towers and spawns are, and the cheapest
 * way in from each side of the room (see conquest/assessment).
 *
 * The way in (a Breach) is found with one Dijkstra search over the room, out from the tiles next to their spawns (or
 * towers, or the controller, if they have no spawns) to every exit tile. Each tile costs what it takes to get through
 * it:
 *   - open ground: 1 (2 for swamp), so the shortest of equally walled paths wins;
 *   - a wall, a rampart (not a public one), or any other structure that blocks movement: its hits, more where towers
 *     hit harder (TOWER_WEIGHT): a thinner wall under three towers can cost more than a thicker one out of their reach;
 *   - natural walls, sources, minerals, the controller, and indestructible walls: impassable.
 * The best exit tile on each side gives that side's breach: the barriers on the path, outermost first. A breach
 * with no barriers is a backdoor: a gap in their walls we can walk straight through.
 *
 * Recorded in Memory.rooms[name].siege whenever we see a base owned by another player who isn't an ally, at most
 * every REFRESH_TICKS (the conquest refreshes its target more often, see conquest/conquest).
 */

const REFRESH_TICKS = 500
/** A barrier's cost grows by this share of its hits for each TOWER_POWER_ATTACK of tower damage on its tile. */
const TOWER_WEIGHT = 0.5
/** Barriers kept per breach; the path rarely crosses more. */
const MAX_BARRIERS = 8

export interface Barrier {
  x: number
  y: number
  hits: number
  type: StructureConstant
}

export interface Breach {
  /** The side we come in from (FIND_EXIT_TOP, _RIGHT, _BOTTOM or _LEFT). */
  side: ExitConstant
  /** The exit tile the path starts from. */
  entry: { x: number; y: number }
  /** Walls, ramparts and other structures on the way, outermost first. */
  barriers: Barrier[]
  /** Their hits together. */
  hits: number
  /** Most tower damage per tick at a barrier (or at the entry, with none): what the squad takes while breaching. */
  breachDamage: number
  /** Most tower damage per tick anywhere on the path: what the squad takes at the core. */
  peakDamage: number
  /** Tiles from the entry to the core. */
  length: number
}

export interface SiegeIntel {
  tick: number
  owner: string
  /** Their towers, with the energy in each. */
  towers: { x: number; y: number; energy: number }[]
  spawns: { x: number; y: number }[]
  /** Hits of their towers and spawns, with any ramparts on them: what has to come down once we're in. */
  coreHits: number
  /** The best way in from each side we could reach the core from, cheapest first. */
  breaches: Breach[]
}

declare global {
  interface RoomMemory {
    siege?: SiegeIntel
  }
}

const key = (x: number, y: number) => y * 50 + x

/** Tower damage per tick at `range`, with the game's falloff: full up close, a quarter from TOWER_FALLOFF_RANGE. */
export function towerDamageAt(range: number): number {
  if (range <= TOWER_OPTIMAL_RANGE) return TOWER_POWER_ATTACK
  if (TOWER_FALLOFF_RANGE <= range) return TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF)
  return (
    TOWER_POWER_ATTACK *
    (1 - (TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE)) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE))
  )
}

/** Record the siege intel of a visible room, if it's another (non-allied) player's base. */
export function recordSiege(room: Room, force = false): void {
  const owner = room.controller?.owner?.username
  if (!owner || owner === myUsername() || isAlly(owner)) {
    if (room.memory.siege) delete room.memory.siege
    return
  }
  const previous = room.memory.siege
  if (!force && previous && Game.time - previous.tick < REFRESH_TICKS) return
  room.memory.siege = survey(room, owner)
}

function survey(room: Room, owner: string): SiegeIntel {
  const hostile = room.find(FIND_HOSTILE_STRUCTURES)
  const towers = hostile.filter(s => s.structureType === STRUCTURE_TOWER) as StructureTower[]
  const spawns = hostile.filter(s => s.structureType === STRUCTURE_SPAWN) as StructureSpawn[]
  const armed = towers.filter(t => TOWER_ENERGY_COST <= t.store.energy || 0 < storedEnergy(room))

  const { hits: barrierHits, blocked, ramparts } = barrierGrid(room)
  const damageAt = (x: number, y: number) =>
    armed.reduce((sum, t) => sum + towerDamageAt(Math.max(Math.abs(t.pos.x - x), Math.abs(t.pos.y - y))), 0)

  const core: RoomPosition[] =
    spawns.length > 0
      ? spawns.map(s => s.pos)
      : towers.length > 0
      ? towers.map(t => t.pos)
      : room.controller
      ? [room.controller.pos]
      : []

  const coreHits = [...towers, ...spawns].reduce((sum, s) => sum + s.hits + (ramparts.get(key(s.pos.x, s.pos.y)) ?? 0), 0)

  return {
    tick: Game.time,
    owner,
    towers: towers.map(t => ({ x: t.pos.x, y: t.pos.y, energy: t.store.energy })),
    spawns: spawns.map(s => ({ x: s.pos.x, y: s.pos.y })),
    coreHits,
    breaches: core.length ? breaches(room, core, barrierHits, blocked, damageAt) : []
  }
}

function storedEnergy(room: Room): number {
  return (room.storage?.store.energy ?? 0) + (room.terminal?.store.energy ?? 0)
}

/**
 * What stands on each tile: hits of the walls, ramparts and blocking structures there (Infinity if they can't be
 * destroyed), and the tiles nothing gets through (sources, minerals, the controller, keeper lairs). Ramparts' hits on
 * their own too, for the core's.
 */
function barrierGrid(room: Room): {
  hits: Map<number, { hits: number; type: StructureConstant }>
  blocked: Set<number>
  ramparts: Map<number, number>
} {
  const hits = new Map<number, { hits: number; type: StructureConstant }>()
  const ramparts = new Map<number, number>()
  const blocked = new Set<number>()
  for (const s of room.find(FIND_STRUCTURES)) {
    const k = key(s.pos.x, s.pos.y)
    if (s.structureType === STRUCTURE_CONTROLLER || s.structureType === STRUCTURE_KEEPER_LAIR) {
      blocked.add(k)
      continue
    }
    if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER) continue
    if (s.structureType === STRUCTURE_RAMPART) {
      if (s.my || s.isPublic) continue
      ramparts.set(k, s.hits)
    }
    // Walls in novice and respawn areas have no hits: they can't be destroyed.
    const h = typeof s.hits === "number" ? s.hits : Infinity
    const current = hits.get(k)
    // A rampart over a structure: both have to go. The type shown is the one on top (the rampart).
    hits.set(k, {
      hits: (current?.hits ?? 0) + h,
      type: current && s.structureType !== STRUCTURE_RAMPART ? current.type : s.structureType
    })
  }
  for (const s of room.find(FIND_SOURCES)) blocked.add(key(s.pos.x, s.pos.y))
  for (const m of room.find(FIND_MINERALS)) blocked.add(key(m.pos.x, m.pos.y))
  return { hits, blocked, ramparts }
}

/** A binary heap of tile keys by cost. */
class MinHeap {
  private keys: number[] = []
  private costs: number[] = []

  public get size(): number {
    return this.keys.length
  }

  public push(k: number, cost: number): void {
    this.keys.push(k)
    this.costs.push(cost)
    let i = this.keys.length - 1
    while (i > 0) {
      const p = Math.floor((i - 1) / 2)
      if (this.costs[p] <= this.costs[i]) break
      this.swap(i, p)
      i = p
    }
  }

  public pop(): [number, number] {
    const top: [number, number] = [this.keys[0], this.costs[0]]
    const lastKey = this.keys.pop()!
    const lastCost = this.costs.pop()!
    if (this.keys.length > 0) {
      this.keys[0] = lastKey
      this.costs[0] = lastCost
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.keys.length && this.costs[l] < this.costs[m]) m = l
        if (r < this.keys.length && this.costs[r] < this.costs[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]]
  }
}

/** The best breach from each side (see the top of this file), cheapest first. */
function breaches(
  room: Room,
  core: RoomPosition[],
  barrierHits: Map<number, { hits: number; type: StructureConstant }>,
  blocked: Set<number>,
  damageAt: (x: number, y: number) => number
): Breach[] {
  const terrain = room.getTerrain()
  const weight = new Float64Array(2500)
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 50; x++) {
      const k = key(x, y)
      const t = terrain.get(x, y)
      if (t === TERRAIN_MASK_WALL || blocked.has(k)) weight[k] = Infinity
      else {
        const barrier = barrierHits.get(k)
        weight[k] = barrier
          ? 1 + barrier.hits * (1 + (TOWER_WEIGHT * damageAt(x, y)) / TOWER_POWER_ATTACK)
          : t === TERRAIN_MASK_SWAMP
          ? 2
          : 1
      }
    }

  const dist = new Float64Array(2500).fill(Infinity)
  const parent = new Int16Array(2500).fill(-1)
  const heap = new MinHeap()
  const coreTiles = new Set(core.map(p => key(p.x, p.y)))
  for (const p of core)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx
        const y = p.y + dy
        if (x < 0 || 49 < x || y < 0 || 49 < y) continue
        const k = key(x, y)
        if (coreTiles.has(k) || weight[k] === Infinity || weight[k] >= dist[k]) continue
        dist[k] = weight[k]
        heap.push(k, dist[k])
      }

  while (heap.size > 0) {
    const [k, d] = heap.pop()
    if (d > dist[k]) continue
    const x = k % 50
    const y = (k - x) / 50
    // Exit tiles end a path: creeps crossing them leave the room.
    if (x === 0 || x === 49 || y === 0 || y === 49) continue
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nk = key(x + dx, y + dy)
        if (coreTiles.has(nk)) continue
        const nd = d + weight[nk]
        if (nd < dist[nk]) {
          dist[nk] = nd
          parent[nk] = k
          heap.push(nk, nd)
        }
      }
  }

  const best = new Map<ExitConstant, number>()
  const consider = (x: number, y: number, side: ExitConstant) => {
    const k = key(x, y)
    if (dist[k] === Infinity) return
    const current = best.get(side)
    if (current === undefined || dist[k] < dist[current]) best.set(side, k)
  }
  for (let i = 1; i < 49; i++) {
    consider(i, 0, FIND_EXIT_TOP)
    consider(49, i, FIND_EXIT_RIGHT)
    consider(i, 49, FIND_EXIT_BOTTOM)
    consider(0, i, FIND_EXIT_LEFT)
  }

  const result: Breach[] = []
  for (const [side, exit] of best) {
    const barriers: Barrier[] = []
    let breachDamage = 0
    let peakDamage = 0
    let length = 0
    for (let k = exit; k !== -1; k = parent[k]) {
      length++
      const x = k % 50
      const y = (k - x) / 50
      const damage = damageAt(x, y)
      peakDamage = Math.max(peakDamage, damage)
      const barrier = barrierHits.get(k)
      if (barrier) {
        breachDamage = Math.max(breachDamage, damage)
        if (barriers.length < MAX_BARRIERS) barriers.push({ x, y, hits: barrier.hits, type: barrier.type })
      }
    }
    const ex = exit % 50
    const ey = (exit - ex) / 50
    if (barriers.length === 0) breachDamage = damageAt(ex, ey)
    result.push({
      side,
      entry: { x: ex, y: ey },
      barriers,
      hits: barriers.reduce((sum, b) => sum + b.hits, 0),
      breachDamage: Math.round(breachDamage),
      peakDamage: Math.round(peakDamage),
      length
    })
  }
  return result.sort((a, b) => dist[key(a.entry.x, a.entry.y)] - dist[key(b.entry.x, b.entry.y)])
}
