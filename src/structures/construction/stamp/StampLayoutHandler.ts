import distanceTransform from "utils/distanceTransform"
import { floodFill } from "utils/floodFill"
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
 * Goal: Plan a room's base out of fixed stamps, as close to the controller as open space allows, then protect it with
 * ramparts along the minimum cut between the base and the exits.
 *
 * Stamps (all fit in a square around their centre, see STAMPS):
 * - rapid fill: 16 extensions, 2 spawns, 2 containers and a link around 4 filler spots (radius 3, required)
 * - anchor: storage, terminal, factory, power spawn, nuker, observer and a link around one manager spot (required)
 * - labs: 10 labs, all within range 2 of the two central ones
 * - towers: 6 towers around one refill spot
 * - extension plus: 5 extensions, repeated until there are 60
 * Whatever doesn't fit as a stamp is placed on single free tiles next to planned roads. Roads then connect the anchor
 * to every stamp, the source and controller containers and the mineral.
 *
 * Each stamp reserves its whole square, stamps stay off the room edge and out of tiles next to exits (the game won't
 * build there), and away from sources, the mineral and the controller. A spawn that already exists is fitted into one
 * of the rapid fill's spawn slots if the terrain allows.
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
    // Distances to the controller over the bare terrain: the planning matrix marks reserved tiles as walls, which
    // would stop the flood right at the controller.
    const distance = floodFill([controllerPos], getTerrainCostMatrix(terrain, []), false)
    const findCenter = (area: number) => findCenterPos(cm, distance, room, area)

    let steps: BuildOrderStep[] = []
    const protectedAreas: Rect[] = []
    const place = (center: Pos, stamp: Stamp) => {
      steps = steps.concat(stamp.build(center))
      markCm(center, stamp.radius, cm)
      protectedAreas.push({
        x1: center.x - stamp.radius,
        y1: center.y - stamp.radius,
        x2: center.x + stamp.radius,
        y2: center.y + stamp.radius
      })
    }

    // Rapid fill, around an existing spawn if there is one and it fits.
    const existingSpawn = room.find(FIND_MY_SPAWNS)[0]
    if (existingSpawn) cm.set(existingSpawn.pos.x, existingSpawn.pos.y, TERRAIN_MASK_WALL)
    const fitted = existingSpawn ? fitRapidFillAroundSpawn(existingSpawn.pos, cm) : null
    if (fitted) {
      place(fitted.center, fitted.stamp)
      room.memory.rapidFill = fitted.center
    } else {
      // In a cramped room the rapid fill may not fit; its spawns and extensions then go on single tiles.
      const center = findCenter(STAMPS.rapidFill.radius + 1)
      if (center) place(center, STAMPS.rapidFill)
      room.memory.rapidFill = center ?? null
    }

    // Likewise the anchor; without it the controller is the hub everything is placed around and connected to.
    const anchorCenter = findCenter(STAMPS.anchor.radius + 1)
    if (anchorCenter) place(anchorCenter, STAMPS.anchor)
    const anchor: Pos = anchorCenter ?? controllerPos

    for (const stamp of [STAMPS.labs, STAMPS.towers]) {
      const center = findCenter(stamp.radius + 1)
      if (center) place(center, stamp)
    }

    while (count(steps, STRUCTURE_EXTENSION) + STAMPS.extensionPlus.extensions <= EXTENSIONS_WANTED) {
      const center = findCenter(STAMPS.extensionPlus.radius + 1)
      if (!center) break
      place(center, STAMPS.extensionPlus)
    }

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

interface Stamp {
  radius: number
  extensions: number
  build: (center: Pos) => BuildOrderStep[]
}

/** Builds a stamp from rows of characters centred on the middle character. */
function stampFrom(rows: string[], legend: { [c: string]: BuildableStructureConstant }): Stamp {
  const radius = (rows.length - 1) / 2
  const cells: { dx: number; dy: number; type: BuildableStructureConstant }[] = []
  rows.forEach((row, y) =>
    row.split("").forEach((c, x) => {
      if (legend[c]) cells.push({ dx: x - radius, dy: y - radius, type: legend[c] })
    })
  )
  return {
    radius,
    extensions: cells.filter(c => c.type === STRUCTURE_EXTENSION).length,
    build: center => cells.map(c => ({ x: center.x + c.dx, y: center.y + c.dy, structureType: c.type }))
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

// "." is a free tile a creep stands on (filler / manager spots, lab access).
const RAPID_FILL = ["rrrrrrr", "rEESEEr", "rE.E.Er", "rCELECr", "rE.E.Er", "rEESEEr", "rrrrrrr"]
// The same rotated 90 degrees, so an existing spawn can sit in a side slot too.
const RAPID_FILL_ROTATED = RAPID_FILL.map((_, i) => RAPID_FILL.map(row => row[i]).join(""))

const STAMPS = {
  rapidFill: stampFrom(RAPID_FILL, LEGEND),
  rapidFillRotated: stampFrom(RAPID_FILL_ROTATED, LEGEND),
  anchor: stampFrom([".rrr.", "rFNPr", "rOrLr", "rMVrr", ".rr.."], LEGEND),
  // 10 labs in a 4x4 block, all within range 2 of the two centre labs; the diagonal road reaches every lab.
  labs: stampFrom(["rBBr.", "BBrB.", "BrBB.", "rBB..", "....."], LEGEND),
  towers: stampFrom([".rrr.", "rTTTr", "rTrTr", ".rTr.", "....."], LEGEND),
  extensionPlus: stampFrom(["..r..", ".rEr.", "rEEEr", ".rEr.", "..r.."], LEGEND)
}

/**
 * Centre the rapid fill so the existing spawn sits in one of its spawn slots, trying both orientations; null if the
 * terrain doesn't allow any of them.
 */
function fitRapidFillAroundSpawn(spawn: RoomPosition, cm: CostMatrix): { center: Pos; stamp: Stamp } | null {
  const r = STAMPS.rapidFill.radius - 1 // spawn slots are 2 from the centre
  const options = [
    { center: { x: spawn.x, y: spawn.y + r }, stamp: STAMPS.rapidFill },
    { center: { x: spawn.x, y: spawn.y - r }, stamp: STAMPS.rapidFill },
    { center: { x: spawn.x + r, y: spawn.y }, stamp: STAMPS.rapidFillRotated },
    { center: { x: spawn.x - r, y: spawn.y }, stamp: STAMPS.rapidFillRotated }
  ]
  return (
    options.find(({ center, stamp }) => {
      for (let dy = -stamp.radius; dy <= stamp.radius; dy++)
        for (let dx = -stamp.radius; dx <= stamp.radius; dx++) {
          const x = center.x + dx
          const y = center.y + dy
          if (x === spawn.x && y === spawn.y) continue
          if (x < 0 || 49 < x || y < 0 || 49 < y || cm.get(x, y) === TERRAIN_MASK_WALL) return false
        }
      return true
    }) ?? null
  )
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
 * The open tile whose surroundings (Chebyshev `area - 1`) are all free, closest by path to the controller.
 * `distance` is a flood fill from the controller; 0 means the flood never reached the tile.
 */
function findCenterPos(cm: CostMatrix, distance: CostMatrix, room: Room, area: number): Pos | null {
  const dt = distanceTransform(cm, room, false)
  let best: Pos | null = null
  let min = Number.MAX_SAFE_INTEGER
  for (let y = 0; y < 50; y++)
    for (let x = 0; x < 50; x++) {
      if (dt.get(x, y) < area) continue
      const d = distance.get(x, y)
      if (0 < d && d < min) {
        min = d
        best = { x, y }
      }
    }
  return best
}

/** Reserve the whole square a stamp covers, inclusive. */
function markCm(center: Pos, radius: number, cm: CostMatrix) {
  for (let y = center.y - radius; y <= center.y + radius; y++)
    for (let x = center.x - radius; x <= center.x + radius; x++)
      if (0 <= x && x <= 49 && 0 <= y && y <= 49) cm.set(x, y, TERRAIN_MASK_WALL)
}

function count(steps: BuildOrderStep[], type: BuildableStructureConstant): number {
  return new Set(steps.filter(s => s.structureType === type).map(s => `${s.x},${s.y}`)).size
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
