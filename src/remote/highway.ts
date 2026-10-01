import { applyKeeperCosts } from "utils/keeperZones"
import { blockedMatrix, isHostileRoom } from "utils/roomSafety"
import { myUsername } from "utils/username"

/**
 * Goal: Roads ("highways") from each home to its remote sources, so remote haulers can carry 2 CARRY per MOVE and
 * still move a tile per tick when full, and keep them in repair cheaply.
 *
 * - Routes are planned by the RemotePlanner (planRoute). Existing roads and tiles already on a highway cost less, so
 *   routes to several sources share a trunk instead of each paying for its own road.
 * - Each home's highway (Memory.highways) is the set of tiles on its remotes' routes, per room, with each room's road
 *   health as last seen: roads missing, lowest hits, roads below MAINTAIN_BELOW, open construction sites.
 * - From ROAD_MIN_RCL, road construction sites are placed along it (placeRoadSites), a few at a time, and placed again
 *   wherever a road has been destroyed. Rooms owned or reserved by other players are skipped: we can't build there.
 * - The highway maintainer (see HighwayMaintainerHandler) builds those sites and repairs the roads. One is spawned
 *   when a road drops below MAINTAIN_BELOW or there are sites to build (needsMaintainer).
 */

/** Roads are built from this RCL: before it the energy is worth more at home, and haulers carry 1 MOVE per CARRY. */
export const ROAD_MIN_RCL = 4
/** A road below this share of its hits calls for the maintainer. */
export const MAINTAIN_BELOW = 0.5
/**
 * The maintainer visits a room with road sites or a road below this share of its hits, and there repairs every road
 * to full. Not 1: roads lose a little every ROAD_DECAY_TIME, so "all full" would never last and it would never be done.
 */
export const VISIT_BELOW = 0.9
/** Share of a highway's tiles that must have a road for haulers to go with 2 CARRY per MOVE. */
export const ROADS_BUILT_SHARE = 0.8
/** Open road construction sites per home at a time, and in all (the game allows MAX_CONSTRUCTION_SITES). */
const MAX_HOME_SITES = 15
const MAX_TOTAL_SITES = 90

export interface HighwayRoom {
  /** Tiles on the highway, as x * 50 + y. */
  tiles: number[]
  /** Last seen: tiles without a road. */
  missing: number
  /** Last seen: roads below MAINTAIN_BELOW of their hits. */
  damaged: number
  /** Last seen: lowest hits share of a road (1 when all are full). */
  lowest: number
  /** Last seen: open road construction sites. */
  sites: number
  /** Tick it was last seen (0: never). */
  checked: number
}

export interface Highway {
  /** Rooms on the highway, nearest to home first. */
  order: string[]
  rooms: { [roomName: string]: HighwayRoom }
}

declare global {
  interface Memory {
    /** Each home's roads to its remote sources (see remote/highway.ts). */
    highways?: { [home: string]: Highway }
  }
}

export interface Route {
  /** Where the miner stands, next to the source: its container goes here. */
  spot: RoomPosition
  /** Road tiles from home to the spot (the spot itself excluded: it gets a container). */
  tiles: RoomPosition[]
  /** Path length, home to spot. */
  length: number
  /** Swamp tiles on it. */
  swamps: number
  /** Energy to build its roads (swamp roads cost 5 times as much), and per tick to keep them up. */
  roadCost: number
  roadUpkeep: number
}

const key = (pos: RoomPosition) => `${pos.roomName}:${pos.x * 50 + pos.y}`

/**
 * The route from origin (home storage or spawn) to a tile next to the source. Tiles already on a highway (`shared`),
 * existing roads and the home's planned roads cost 1, plain 2 and swamp 10, so routes share roads and avoid swamps.
 * Hostile rooms are impassable; source keepers are given a wide berth; in rooms we can see, structures we can't walk
 * on are avoided, as are the home's planned buildings.
 */
export function planRoute(
  origin: RoomPosition,
  source: RoomPosition,
  shared: Set<string>,
  maxRooms: number
): Route | null {
  const result = PathFinder.search(
    origin,
    { pos: source, range: 1 },
    {
      plainCost: 2,
      swampCost: 10,
      maxOps: 20000,
      maxRooms,
      roomCallback: roomName => {
        if (isHostileRoom(roomName)) return blockedMatrix()
        const matrix = new PathFinder.CostMatrix()
        const room = Game.rooms[roomName]
        for (const step of room?.memory.buildOrder ?? []) {
          if (step.structureType === STRUCTURE_ROAD) matrix.set(step.x, step.y, 1)
          else if ((OBSTACLE_OBJECT_TYPES as string[]).includes(step.structureType)) matrix.set(step.x, step.y, 0xff)
        }
        for (const s of room?.find(FIND_STRUCTURES) ?? []) {
          if (s.structureType === STRUCTURE_ROAD) matrix.set(s.pos.x, s.pos.y, 1)
          else if ((OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType)) matrix.set(s.pos.x, s.pos.y, 0xff)
        }
        for (const k of shared) {
          const [name, xy] = k.split(":")
          if (name === roomName && matrix.get(Math.floor(+xy / 50), +xy % 50) < 0xff)
            matrix.set(Math.floor(+xy / 50), +xy % 50, 1)
        }
        return applyKeeperCosts(roomName, matrix)
      }
    }
  )
  if (result.incomplete || result.path.length <= 0) return null

  const spot = result.path[result.path.length - 1]
  const tiles = result.path.slice(0, -1)
  let swamps = 0
  let roadCost = 0
  let roadUpkeep = 0
  for (const pos of tiles) {
    const swamp = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y) === TERRAIN_MASK_SWAMP
    const ratio = swamp ? CONSTRUCTION_COST_ROAD_SWAMP_RATIO : 1
    if (swamp) swamps++
    roadCost += CONSTRUCTION_COST[STRUCTURE_ROAD] * ratio
    roadUpkeep += (ROAD_DECAY_AMOUNT * ratio * REPAIR_COST) / ROAD_DECAY_TIME
  }
  return { spot, tiles, length: result.path.length, swamps, roadCost, roadUpkeep }
}

/** The tiles of a route, keyed as planRoute's `shared` expects. */
/**
 * Ticks for a hauler's round trip (walking only). Over roads, 1 per tile each way. Without roads a hauler has 1 MOVE
 * per CARRY: 1 tick per tile out (empty), and back (full) 1 per plain tile but 5 per swamp tile.
 */
export function roundTrip(route: Route, roads: boolean): number {
  return roads ? 2 * route.length : 2 * route.length + 4 * route.swamps
}

export function routeKeys(route: Route): string[] {
  return route.tiles.map(key)
}

/**
 * Replace a home's highway with the given tiles, keeping what was last seen of rooms that stay on it (their health
 * is refreshed when next seen).
 */
export function setHighway(home: string, tiles: RoomPosition[]): void {
  const highways = (Memory.highways = Memory.highways ?? {})
  const previous = highways[home]
  const rooms: { [room: string]: HighwayRoom } = {}
  const order: string[] = []
  for (const pos of tiles) {
    let room = rooms[pos.roomName]
    if (!room) {
      const old = previous?.rooms[pos.roomName]
      room = rooms[pos.roomName] = {
        tiles: [],
        missing: old?.missing ?? 0,
        damaged: old?.damaged ?? 0,
        lowest: old?.lowest ?? 1,
        sites: old?.sites ?? 0,
        checked: old?.checked ?? 0
      }
      order.push(pos.roomName)
    }
    const xy = pos.x * 50 + pos.y
    if (!room.tiles.includes(xy)) room.tiles.push(xy)
  }
  if (order.length <= 0) delete highways[home]
  else highways[home] = { order, rooms }
}

/** Refresh the health of every highway room we can see. */
export function surveyHighways(): void {
  for (const highway of Object.values(Memory.highways ?? {}))
    for (const [name, entry] of Object.entries(highway.rooms)) {
      const room = Game.rooms[name]
      if (room) survey(room, entry)
    }
}

/** Update a highway room's health from what we see now. */
export function survey(room: Room, entry: HighwayRoom): void {
  const roads = new Map<number, StructureRoad>()
  for (const s of room.find(FIND_STRUCTURES))
    if (s.structureType === STRUCTURE_ROAD) roads.set(s.pos.x * 50 + s.pos.y, s as StructureRoad)
  const sites = new Set(
    room
      .find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_ROAD })
      .map(s => s.pos.x * 50 + s.pos.y)
  )
  let missing = 0
  let damaged = 0
  let lowest = 1
  let open = 0
  for (const xy of entry.tiles) {
    const road = roads.get(xy)
    if (sites.has(xy)) open++
    if (!road) {
      missing++
      continue
    }
    const share = road.hits / road.hitsMax
    lowest = Math.min(lowest, share)
    if (share < MAINTAIN_BELOW) damaged++
  }
  Object.assign(entry, { missing, damaged, lowest, sites: open, checked: Game.time })
}

/** Share of a home's highway tiles that had a road when last seen. */
export function builtShare(home: string): number {
  const highway = Memory.highways?.[home]
  if (!highway) return 0
  let tiles = 0
  let missing = 0
  for (const room of Object.values(highway.rooms)) {
    tiles += room.tiles.length
    missing += room.checked ? room.missing : room.tiles.length
  }
  return tiles ? (tiles - missing) / tiles : 0
}

/** Whether a room is ours to build in: nobody else owns or reserves it. */
export function canBuildIn(roomName: string): boolean {
  const room = Game.rooms[roomName]
  const controller = room ? room.controller : undefined
  const owner = controller ? controller.owner?.username : Memory.rooms[roomName]?.intel?.controller?.owner
  const reservedBy = controller
    ? controller.reservation?.username
    : Memory.rooms[roomName]?.intel?.controller?.reservedBy
  const me = myUsername()
  return (!owner || owner === me) && (!reservedBy || reservedBy === me)
}

/**
 * Place road construction sites along a home's highway, nearest rooms first, in rooms we can see and may build in,
 * keeping at most MAX_HOME_SITES of the home's road sites open. A destroyed road gets its site back here too.
 */
export function placeRoadSites(home: Room): void {
  const highway = Memory.highways?.[home.name]
  if (!highway || (home.controller?.level ?? 0) < ROAD_MIN_RCL) return

  const all = Object.values(Game.constructionSites)
  let open = all.filter(s => s.structureType === STRUCTURE_ROAD && highway.rooms[s.pos.roomName]).length
  let total = all.length
  for (const name of highway.order) {
    const room = Game.rooms[name]
    if (!room || !canBuildIn(name)) continue
    const terrain = room.getTerrain()
    const taken = new Set(
      [...room.find(FIND_STRUCTURES), ...room.find(FIND_CONSTRUCTION_SITES)]
        .filter(
          s => s.structureType === STRUCTURE_ROAD || (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType)
        )
        .map(s => s.pos.x * 50 + s.pos.y)
    )
    for (const xy of highway.rooms[name].tiles) {
      if (MAX_HOME_SITES <= open || MAX_TOTAL_SITES <= total) return
      const x = Math.floor(xy / 50)
      const y = xy % 50
      if (taken.has(xy) || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      if (room.createConstructionSite(x, y, STRUCTURE_ROAD) === OK) {
        open++
        total++
      }
    }
  }
}

/**
 * Whether the home's highway needs its maintainer: a road below MAINTAIN_BELOW, or road sites to build outside the
 * home room (the home's own builders take care of those inside it).
 */
export function needsMaintainer(home: string): boolean {
  const highway = Memory.highways?.[home]
  if (!highway) return false
  return Object.entries(highway.rooms).some(([name, room]) => 0 < room.damaged || (name !== home && 0 < room.sites))
}

/** Highway rooms (nearest to home first) where the maintainer has work: sites, or roads below VISIT_BELOW. */
export function roomsNeedingWork(home: string): string[] {
  const highway = Memory.highways?.[home]
  if (!highway) return []
  return highway.order.filter(name => {
    const room = highway.rooms[name]
    return name !== home && (0 < room.sites || room.lowest < VISIT_BELOW || !room.checked)
  })
}
