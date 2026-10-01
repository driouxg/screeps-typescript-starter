import IConstructionHandler from "../IConstructionHandler"
import ILayoutHandler from "../ILayoutHandler"
import minCut from "../../../utils/minCut"

type Pos = { x: number; y: number }
type Rect = { x1: number; y1: number; x2: number; y2: number }

/** Structures creeps can walk on; any other structure blocks its tile. */
const WALKABLE: StructureConstant[] = [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART]
const EXTENSIONS_WANTED = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][8]
/** Keep stamps this far from sources/mineral and the controller, so miners and upgraders have room. */
const SOURCE_BUFFER = 1
const CONTROLLER_BUFFER = 2

/**
 * Goal: Plan a compact base out of fixed stamps, placed where it saves the most walking, then protect it with ramparts
 * along the minimum cut between the base and the exits.
 *
 * Stamps (see STAMPS):
 * - rapid fill: 16 extensions, 2 spawns, 2 containers and a link around 4 filler spots (the core)
 * - anchor: storage, terminal, factory, power spawn, nuker, observer and a link around one manager spot
 * - towers: 6 towers around one refill spot
 * - labs: 10 labs, all within range 2 of the two central ones
 * - extension plus: 5 extensions, repeated until there are 60
 *
 * Placement:
 * - The core is the rapid fill. Around the first spawn if there is one (and it fits); otherwise where the walk to the
 *   controller plus the walk to each source is shortest, as energy flows from the sources to the base and from the
 *   base to the controller.
 * - Every other stamp goes as close to the core as it fits (by walking distance), in order of how often creeps go
 *   there: anchor, towers (central, to cover the whole rampart line), extensions, labs (once there are
 *   LABS_AFTER_EXTENSIONS extensions: labs matter from RCL 6), then the remaining extensions.
 * - Stamps share their road rings and empty corners with each other instead of each reserving a whole square, so the
 *   base packs tightly. A stamp's filler/manager spots ('.') stay walkable.
 * - Whatever doesn't fit as a stamp is placed on single free tiles next to planned roads; roads then connect the
 *   anchor to every stamp, the source and controller containers and the mineral.
 *
 * Stamps stay off the room edge and out of tiles next to exits (the game won't build there), and away from sources,
 * the mineral and the controller.
 */
export default class StampLayoutHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[]
  private cache?: { room: string; tick: number; plan: BuildOrderStep[] | null }

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers
  }

  handle(room: Room): BuildOrderStep[] {
    return this.plan(room) ?? []
  }

  isRoomForLayout(room: Room): boolean {
    return this.plan(room) !== null
  }

  /** Plans once per room per tick: isRoomForLayout and handle are called back to back. */
  private plan(room: Room): BuildOrderStep[] | null {
    if (this.cache?.room !== room.name || this.cache.tick !== Game.time)
      this.cache = { room: room.name, tick: Game.time, plan: this.go(room) }
    return this.cache.plan
  }

  private go(room: Room): BuildOrderStep[] | null {
    const controllerPos = room.controller?.pos
    if (!controllerPos) return null

    const terrain = room.getTerrain()
    const cm = getTerrainCostMatrix(terrain, [])
    reserveForbiddenTiles(room, cm)
    const grid = new Grid(terrain, cm)
    grid.keepWalkableAround(room, cm)

    let steps: BuildOrderStep[] = []
    const protectedAreas: Rect[] = []
    const place = (center: Pos, stamp: Stamp) => {
      steps = steps.concat(stamp.build(center))
      grid.mark(center, stamp, cm)
      protectedAreas.push({
        x1: center.x - stamp.radius,
        y1: center.y - stamp.radius,
        x2: center.x + stamp.radius,
        y2: center.y + stamp.radius
      })
    }

    // The core: the rapid fill, around an existing spawn if it fits, else where the walking is shortest.
    const existingSpawn = room.find(FIND_MY_SPAWNS)[0]
    const fitted = existingSpawn ? grid.fitAroundSpawn(existingSpawn.pos) : null
    if (existingSpawn) grid.block(existingSpawn.pos, cm)
    // An existing spawn the rapid fill can't wrap around: the rapid fill goes as close to it as it fits instead.
    const core = fitted ?? (existingSpawn ? grid.nearestCore(existingSpawn.pos) : grid.bestCore(room, controllerPos))
    if (core) place(core.center, core.stamp)
    room.memory.rapidFill = core ? core.center : null
    const hub: Pos = core?.center ?? existingSpawn?.pos ?? controllerPos

    // Everything else as close to the core as it fits.
    const order = grid.byDistanceFrom(hub)
    const placeNear = (stamp: Stamp) => {
      const center = grid.firstFit(stamp, order)
      if (center) place(center, stamp)
      return center
    }
    const anchorCenter = placeNear(STAMPS.anchor)
    const anchor: Pos = anchorCenter ?? hub
    placeNear(STAMPS.towers)
    const addExtensions = (upTo: number) => {
      while (count(steps, STRUCTURE_EXTENSION) + STAMPS.extensionPlus.extensions <= upTo)
        if (!placeNear(STAMPS.extensionPlus)) break
    }
    addExtensions(LABS_AFTER_EXTENSIONS)
    placeNear(STAMPS.labs)
    addExtensions(EXTENSIONS_WANTED)

    // A spawn that didn't fit the rapid fill stays where it is, and needs the ramparts' protection too.
    if (existingSpawn && !fitted) {
      const { x, y } = existingSpawn.pos
      steps.unshift({ x, y, structureType: STRUCTURE_SPAWN })
      protectedAreas.push({ x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1 })
    }

    // Whatever didn't fit as a stamp goes on single tiles next to the planned roads, nearest the anchor first, each
    // with a small protected area so the ramparts cover it too.
    const singleTypes: BuildableStructureConstant[] = [
      STRUCTURE_SPAWN,
      STRUCTURE_STORAGE,
      STRUCTURE_TOWER,
      STRUCTURE_TERMINAL,
      STRUCTURE_EXTENSION,
      STRUCTURE_FACTORY,
      STRUCTURE_POWER_SPAWN,
      STRUCTURE_NUKER,
      STRUCTURE_OBSERVER
    ]
    for (const [type, wanted] of singleTypes.map(t => [t, CONTROLLER_STRUCTURES[t][8]]) as [
      BuildableStructureConstant,
      number
    ][]) {
      const singles = fillSingles(steps, cm, terrain, anchor, type, wanted - count(steps, type))
      steps = steps.concat(singles)
      singles.forEach(s => protectedAreas.push({ x1: s.x - 1, y1: s.y - 1, x2: s.x + 1, y2: s.y + 1 }))
    }

    this.constructionHandlers.forEach(c => (steps = c.handle(room, steps)))
    steps = steps.concat(connectingRoads(room, steps, anchor))

    const ramparts = minCut.test(room.name, protectedAreas.map(clampToRoom).filter(isValidRect))
    steps = steps.concat((ramparts || []).map(p => ({ x: p.x, y: p.y, structureType: STRUCTURE_RAMPART })))

    return normalize(steps, terrain, room)
  }
}

/** Labs matter from RCL 6: the extensions every RCL needs (up to this many) get the closer tiles. */
const LABS_AFTER_EXTENSIONS = 40

function count(steps: BuildOrderStep[], type: BuildableStructureConstant): number {
  return new Set(steps.filter(s => s.structureType === type).map(s => `${s.x},${s.y}`)).size
}

type Cell = { dx: number; dy: number; kind: "structure" | "road" | "keep"; type?: BuildableStructureConstant }

interface Stamp {
  radius: number
  extensions: number
  cells: Cell[]
  build: (center: Pos) => BuildOrderStep[]
}

/**
 * Builds a stamp from rows of characters centred on the middle character: a LEGEND letter is that structure, "." a
 * tile that must stay walkable (a filler or manager spot), "_" a tile the stamp doesn't care about (another stamp may
 * use it).
 */
function stampFrom(rows: string[], legend: { [c: string]: BuildableStructureConstant }): Stamp {
  const radius = (rows.length - 1) / 2
  const cells: Cell[] = []
  rows.forEach((row, y) =>
    row.split("").forEach((c, x) => {
      const at = { dx: x - radius, dy: y - radius }
      if (legend[c]) cells.push({ ...at, kind: legend[c] === STRUCTURE_ROAD ? "road" : "structure", type: legend[c] })
      else if (c === ".") cells.push({ ...at, kind: "keep" })
    })
  )
  return {
    radius,
    extensions: cells.filter(c => c.type === STRUCTURE_EXTENSION).length,
    cells,
    build: center =>
      cells.filter(c => c.type).map(c => ({ x: center.x + c.dx, y: center.y + c.dy, structureType: c.type! }))
  }
}

const LEGEND: { [c: string]: BuildableStructureConstant } = {
  E: STRUCTURE_EXTENSION,
  S: STRUCTURE_SPAWN,
  C: STRUCTURE_CONTAINER,
  L: STRUCTURE_LINK,
  r: STRUCTURE_ROAD,
  T: STRUCTURE_TOWER,
  B: STRUCTURE_LAB,
  O: STRUCTURE_STORAGE,
  M: STRUCTURE_TERMINAL,
  F: STRUCTURE_FACTORY,
  P: STRUCTURE_POWER_SPAWN,
  N: STRUCTURE_NUKER,
  V: STRUCTURE_OBSERVER
}

const RAPID_FILL = ["rrrrrrr", "rEESEEr", "rE.E.Er", "rCELECr", "rE.E.Er", "rEESEEr", "rrrrrrr"]
// The same rotated 90 degrees, so an existing spawn can sit in a side slot too.
const RAPID_FILL_ROTATED = RAPID_FILL.map((_, i) => RAPID_FILL.map(row => row[i]).join(""))

const STAMPS = {
  rapidFill: stampFrom(RAPID_FILL, LEGEND),
  rapidFillRotated: stampFrom(RAPID_FILL_ROTATED, LEGEND),
  anchor: stampFrom(["_rrr_", "rFNPr", "rOrLr", "rMVrr", "_rr__"], LEGEND),
  // 10 labs in a 4x4 block, all within range 2 of the two centre labs; the diagonal road reaches every lab.
  labs: stampFrom(["rBBr_", "BBrB_", "BrBB_", "rBB__", "_____"], LEGEND),
  towers: stampFrom(["_rrr_", "rTTTr", "rTrTr", "_rTr_", "_____"], LEGEND),
  extensionPlus: stampFrom(["__r__", "_rEr_", "rEEEr", "_rEr_", "__r__"], LEGEND)
}

const FREE = 0
const ROAD = 1
const KEEP = 2
const BLOCKED = 3

/**
 * What the stamps have used of each tile so far: free, a planned road or a spot to keep walkable (both of which other
 * stamps' roads and spots may share), or blocked (a structure, a wall, or reserved: see reserveForbiddenTiles).
 */
class Grid {
  private tiles = new Uint8Array(2500)

  public constructor(private terrain: RoomTerrain, cm: CostMatrix) {
    for (let y = 0; y < 50; y++)
      for (let x = 0; x < 50; x++) if (cm.get(x, y) === TERRAIN_MASK_WALL) this.tiles[y * 50 + x] = BLOCKED
  }

  private at(x: number, y: number): number {
    return x < 0 || 49 < x || y < 0 || 49 < y ? BLOCKED : this.tiles[y * 50 + x]
  }

  /** Whether the stamp fits centred here. `spawn`: an existing spawn, which only the stamp's spawn slot may cover. */
  public fits(center: Pos, stamp: Stamp, spawn?: Pos): boolean {
    for (const c of stamp.cells) {
      const x = center.x + c.dx
      const y = center.y + c.dy
      if (spawn && x === spawn.x && y === spawn.y) {
        if (c.type !== STRUCTURE_SPAWN) return false
        continue
      }
      const tile = this.at(x, y)
      if (c.kind === "structure" ? tile !== FREE : tile === BLOCKED) return false
      if (c.kind !== "structure" && this.terrain.get(x, y) === TERRAIN_MASK_WALL) return false
    }
    return true
  }

  /** Record a placed stamp, and mirror it into `cm` (TERRAIN_MASK_WALL: taken) for the single-tile placement. */
  public mark(center: Pos, stamp: Stamp, cm: CostMatrix): void {
    for (const c of stamp.cells) {
      const x = center.x + c.dx
      const y = center.y + c.dy
      const i = y * 50 + x
      if (c.kind === "structure") this.tiles[i] = BLOCKED
      else if (this.tiles[i] === FREE) this.tiles[i] = c.kind === "road" ? ROAD : KEEP
      cm.set(x, y, TERRAIN_MASK_WALL)
    }
  }

  public block(pos: Pos, cm: CostMatrix): void {
    this.tiles[pos.y * 50 + pos.x] = BLOCKED
    cm.set(pos.x, pos.y, TERRAIN_MASK_WALL)
  }

  /**
   * Tiles 2 from a source or the mineral may get roads but no structures, so the ring around the miners and their
   * container stays walkable (structures 1 from them are already ruled out, see reserveForbiddenTiles).
   */
  public keepWalkableAround(room: Room, cm: CostMatrix): void {
    for (const o of [...room.find(FIND_SOURCES), ...room.find(FIND_MINERALS)])
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = o.pos.x + dx
          const y = o.pos.y + dy
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2 || this.at(x, y) !== FREE) continue
          this.tiles[y * 50 + x] = KEEP
          cm.set(x, y, TERRAIN_MASK_WALL)
        }
  }

  /** The rapid fill as close (by walking distance) to `pos` as it fits, either orientation. */
  public nearestCore(pos: Pos): { center: Pos; stamp: Stamp } | null {
    for (const center of this.byDistanceFrom(pos)) {
      const stamp = [STAMPS.rapidFill, STAMPS.rapidFillRotated].find(s => this.fits(center, s))
      if (stamp) return { center, stamp }
    }
    return null
  }

  /** The rapid fill placed so the existing spawn sits in one of its spawn slots (either orientation), if it fits. */
  public fitAroundSpawn(spawn: Pos): { center: Pos; stamp: Stamp } | null {
    const r = STAMPS.rapidFill.radius - 1 // spawn slots are 2 from the centre
    const options = [
      { center: { x: spawn.x, y: spawn.y + r }, stamp: STAMPS.rapidFill },
      { center: { x: spawn.x, y: spawn.y - r }, stamp: STAMPS.rapidFill },
      { center: { x: spawn.x + r, y: spawn.y }, stamp: STAMPS.rapidFillRotated },
      { center: { x: spawn.x - r, y: spawn.y }, stamp: STAMPS.rapidFillRotated }
    ]
    return options.find(o => this.fits(o.center, o.stamp, spawn)) ?? null
  }

  /**
   * Where the rapid fill (the core) goes in an empty room: of the tiles it fits on, the one with the shortest walk to
   * the controller plus to each source.
   */
  public bestCore(room: Room, controller: RoomPosition): { center: Pos; stamp: Stamp } | null {
    const maps = [controller, ...room.find(FIND_SOURCES).map(s => s.pos)].map(p => this.walkingDistances(p))
    let best: { center: Pos; stamp: Stamp } | null = null
    let bestCost = Infinity
    for (let y = 2; y < 48; y++)
      for (let x = 2; x < 48; x++) {
        const d = maps.map(m => m[y * 50 + x])
        if (d.some(v => v < 0)) continue
        const cost = d.reduce((a, b) => a + b, 0)
        if (bestCost <= cost) continue
        const center = { x, y }
        const stamp = [STAMPS.rapidFill, STAMPS.rapidFillRotated].find(s => this.fits(center, s))
        if (!stamp) continue
        best = { center, stamp }
        bestCost = cost
      }
    return best
  }

  /** Tiles in order of walking distance from `from` (over the terrain), nearest first. */
  public byDistanceFrom(from: Pos): Pos[] {
    const d = this.walkingDistances(from)
    const tiles: Pos[] = []
    for (let i = 0; i < 2500; i++) if (0 <= d[i]) tiles.push({ x: i % 50, y: Math.floor(i / 50) })
    return tiles.sort((a, b) => d[a.y * 50 + a.x] - d[b.y * 50 + b.x])
  }

  /** The first centre in `order` the stamp fits on. */
  public firstFit(stamp: Stamp, order: Pos[]): Pos | null {
    return order.find(center => this.fits(center, stamp)) ?? null
  }

  /** Walking distance from `from` to every tile over the terrain (walls block), -1 where it can't be reached. */
  private walkingDistances(from: Pos): Int16Array {
    const d = new Int16Array(2500).fill(-1)
    d[from.y * 50 + from.x] = 0
    const queue = [from.y * 50 + from.x]
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]
      const cx = cur % 50
      const cy = Math.floor(cur / 50)
      for (const [dx, dy] of RING) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || 49 < x || y < 0 || 49 < y) continue
        const j = y * 50 + x
        if (d[j] !== -1 || this.terrain.get(x, y) === TERRAIN_MASK_WALL) continue
        d[j] = d[cur] + 1
        queue.push(j)
      }
    }
    return d
  }
}

/**
 * Tiles stamps must not use: the room edge and the tile next to it (the game forbids most structures next to exits),
 * and the surroundings of sources, the mineral and the controller.
 */
function reserveForbiddenTiles(room: Room, cm: CostMatrix) {
  for (let i = 0; i < 50; i++)
    for (const [x, y] of [
      [0, i],
      [1, i],
      [48, i],
      [49, i],
      [i, 0],
      [i, 1],
      [i, 48],
      [i, 49]
    ])
      cm.set(x, y, TERRAIN_MASK_WALL)

  const keepClear = (pos: RoomPosition, range: number) => {
    for (let dy = -range; dy <= range; dy++)
      for (let dx = -range; dx <= range; dx++) {
        const x = pos.x + dx
        const y = pos.y + dy
        if (0 <= x && x <= 49 && 0 <= y && y <= 49) cm.set(x, y, TERRAIN_MASK_WALL)
      }
  }
  room.find(FIND_SOURCES).forEach(s => keepClear(s.pos, SOURCE_BUFFER))
  room.find(FIND_MINERALS).forEach(m => keepClear(m.pos, SOURCE_BUFFER))
  if (room.controller) keepClear(room.controller.pos, CONTROLLER_BUFFER)
}

/**
 * Place up to `n` structures on free tiles next to planned roads (so they can be reached), nearest `near` first.
 * Free means open terrain the stamps didn't use and away from exits and resources (the cost matrix is 0 or swamp).
 */
function fillSingles(
  steps: BuildOrderStep[],
  cm: CostMatrix,
  terrain: RoomTerrain,
  near: Pos,
  type: BuildableStructureConstant,
  n: number
) {
  if (n <= 0) return []
  const solid = new Set(steps.filter(s => !WALKABLE.includes(s.structureType)).map(s => `${s.x},${s.y}`))
  const walkable = (x: number, y: number) =>
    0 <= x && x <= 49 && 0 <= y && y <= 49 && terrain.get(x, y) !== TERRAIN_MASK_WALL && !solid.has(`${x},${y}`)
  const roads = new Set(steps.filter(s => s.structureType === STRUCTURE_ROAD).map(s => `${s.x},${s.y}`))
  const candidates: Pos[] = []
  for (let y = 2; y < 48; y++)
    for (let x = 2; x < 48; x++) {
      if (cm.get(x, y) === TERRAIN_MASK_WALL) continue
      const byRoad = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => roads.has(`${x + dx},${y + dy}`)))
      if (byRoad || roads.size === 0) candidates.push({ x, y }) // no stamps at all: any open tile
    }
  candidates.sort(
    (a, b) =>
      Math.max(Math.abs(a.x - near.x), Math.abs(a.y - near.y)) -
      Math.max(Math.abs(b.x - near.x), Math.abs(b.y - near.y))
  )

  const placed: BuildOrderStep[] = []
  for (const pos of candidates) {
    if (n <= placed.length) break
    if (cm.get(pos.x, pos.y) === TERRAIN_MASK_WALL || splitsWalkable(pos, walkable)) continue
    placed.push({ x: pos.x, y: pos.y, structureType: type })
    cm.set(pos.x, pos.y, TERRAIN_MASK_WALL)
    solid.add(`${pos.x},${pos.y}`)
  }
  return placed
}

const RING: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0]
]

/**
 * Whether blocking `pos` could cut a path: its walkable neighbours don't form one connected group among themselves.
 * (A line of structures along a narrow corridor would otherwise wall part of the base off.)
 */
function splitsWalkable(pos: Pos, walkable: (x: number, y: number) => boolean): boolean {
  const open = RING.filter(([dx, dy]) => walkable(pos.x + dx, pos.y + dy))
  if (open.length <= 1) return false

  const seen = new Set<number>([0])
  const queue = [0]
  while (queue.length) {
    const [ax, ay] = open[queue.pop()!]
    open.forEach(([bx, by], j) => {
      if (!seen.has(j) && Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1) {
        seen.add(j)
        queue.push(j)
      }
    })
  }
  return seen.size < open.length
}

/**
 * Roads from the anchor to every stamp's roads, the containers (sources and controller) and the mineral, reusing
 * planned roads where possible.
 */
function connectingRoads(room: Room, steps: BuildOrderStep[], anchor: Pos): BuildOrderStep[] {
  const terrain = room.getTerrain()
  const blocked = new Set(steps.filter(s => !WALKABLE.includes(s.structureType)).map(s => `${s.x},${s.y}`))
  const roads = new Set(steps.filter(s => s.structureType === STRUCTURE_ROAD).map(s => `${s.x},${s.y}`))
  const matrix = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 50; x++) {
      const t = terrain.get(x, y)
      matrix.set(
        x,
        y,
        t === TERRAIN_MASK_WALL || blocked.has(`${x},${y}`)
          ? 0xff
          : roads.has(`${x},${y}`)
          ? 1
          : t === TERRAIN_MASK_SWAMP
          ? 5
          : 2
      )
    }

  const targets: RoomPosition[] = [
    ...steps.filter(s => s.structureType === STRUCTURE_CONTAINER).map(s => new RoomPosition(s.x, s.y, room.name)),
    ...room.find(FIND_MINERALS).map(m => m.pos),
    ...steps
      .filter(
        s =>
          s.structureType === STRUCTURE_SPAWN ||
          s.structureType === STRUCTURE_TOWER ||
          s.structureType === STRUCTURE_LAB
      )
      .map(s => new RoomPosition(s.x, s.y, room.name))
  ]
  const start = new RoomPosition(anchor.x, anchor.y, room.name)
  const added: BuildOrderStep[] = []
  for (const target of targets) {
    const result = PathFinder.search(
      start,
      { pos: target, range: 1 },
      { roomCallback: () => matrix, maxRooms: 1, swampCost: 5, plainCost: 2 }
    )
    if (result.incomplete) continue
    for (const p of result.path) {
      const key = `${p.x},${p.y}`
      if (roads.has(key) || blocked.has(key)) continue
      roads.add(key)
      matrix.set(p.x, p.y, 1)
      added.push({ x: p.x, y: p.y, structureType: STRUCTURE_ROAD })
    }
  }
  return added
}

function clampToRoom(r: Rect): Rect {
  return { x1: Math.max(2, r.x1), y1: Math.max(2, r.y1), x2: Math.min(47, r.x2), y2: Math.min(47, r.y2) }
}

function isValidRect(r: Rect): boolean {
  return r.x1 < r.x2 && r.y1 < r.y2
}

/**
 * Drop steps the game would refuse (off the room, next to an exit, on a wall, extractor off the mineral), duplicates,
 * roads under non-walkable structures, and any structure on a tile an earlier structure already uses.
 */
function normalize(steps: BuildOrderStep[], terrain: RoomTerrain, room: Room): BuildOrderStep[] {
  const mineral = room.find(FIND_MINERALS)[0]
  const isWall = (x: number, y: number) => terrain.get(x, y) === TERRAIN_MASK_WALL
  const nextToExit = (x: number, y: number) => {
    const border =
      x === 1
        ? [
            [0, y - 1],
            [0, y],
            [0, y + 1]
          ]
        : x === 48
        ? [
            [49, y - 1],
            [49, y],
            [49, y + 1]
          ]
        : y === 1
        ? [
            [x - 1, 0],
            [x, 0],
            [x + 1, 0]
          ]
        : y === 48
        ? [
            [x - 1, 49],
            [x, 49],
            [x + 1, 49]
          ]
        : []
    return border.some(([bx, by]) => !isWall(bx, by))
  }
  const allowed = (s: BuildOrderStep) => {
    if (s.x < 1 || 48 < s.x || s.y < 1 || 48 < s.y) return false
    if (s.structureType === STRUCTURE_EXTRACTOR) return !!mineral && mineral.pos.x === s.x && mineral.pos.y === s.y
    if (s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && nextToExit(s.x, s.y))
      return false
    return s.structureType === STRUCTURE_ROAD || !isWall(s.x, s.y)
  }

  const solidAt = new Map<string, StructureConstant>()
  for (const s of steps) {
    if (!allowed(s) || s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue
    const key = `${s.x},${s.y}`
    if (!solidAt.has(key)) solidAt.set(key, s.structureType)
  }

  const seen = new Set<string>()
  return steps.filter(s => {
    const key = `${s.x},${s.y}`
    const id = `${key},${s.structureType}`
    if (seen.has(id) || !allowed(s)) return false
    const solid = solidAt.get(key)
    if (s.structureType === STRUCTURE_ROAD && solid && !WALKABLE.includes(solid)) return false
    if (s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && solid !== s.structureType)
      return false
    seen.add(id)
    return true
  })
}

/**
 * Terrain cost matrix: 1 (TERRAIN_MASK_WALL) marks tiles stamps can't use, including already planned structures.
 */
export function getTerrainCostMatrix(terrain: RoomTerrain, buildOrder: BuildOrderStep[]) {
  let c = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      c.set(x, y, terrain.get(x, y))
    }
  }

  for (let step of buildOrder) {
    c.set(step.x, step.y, TERRAIN_MASK_WALL)
  }

  return c
}
