/** Overlays are redrawn this often (roads get built, sites placed); in between they're replayed. */
const REDRAW_TICKS = 20

const PLANNED = "#4dc3ff"
const SITE = "#ffd84d"
const BUILT = "#8a8f98"

declare global {
  interface Memory {
    /** Homes whose highway plan is drawn in the game (toggled from the dashboard; see highwayVisualizer). */
    highwayOverlay?: { [home: string]: boolean | null }
  }
}

/** Drawn overlays, per room (and "map" for the world map): replayed with import() instead of redrawn every tick. */
const cache = new Map<string, { tick: number; visual: string }>()

/**
 * Goal: Show a home's highway plan (Memory.highways, see remote/highway) in the game, when switched on for it from the
 * dashboard (Memory.highwayOverlay), so routes can be looked over before their roads are built.
 *
 * In each room on the highway (drawn whether or not we can see it): planned road tiles as blue dots, yellow where a
 * construction site is placed, grey where the road is built (only known with vision); remote miners' container spots
 * as squares. On the world map, every planned tile, so whole routes can be followed across rooms.
 */
export function drawHighways(): void {
  const homes = Object.entries(Memory.highwayOverlay ?? {})
    .filter(([home, on]) => on && Memory.highways?.[home])
    .map(([home]) => home)
  if (homes.length <= 0) {
    cache.clear()
    return
  }

  const rooms = new Map<string, Set<number>>()
  for (const home of homes)
    for (const [name, entry] of Object.entries(Memory.highways![home].rooms)) {
      const tiles = rooms.get(name) ?? new Set<number>()
      for (const xy of entry.tiles) tiles.add(xy)
      rooms.set(name, tiles)
    }
  const spots = Object.values(Memory.remotes ?? {}).filter(r => homes.includes(r.home))

  for (const [name, tiles] of rooms)
    replay(name, new RoomVisual(name), visual => drawRoom(name, visual, tiles, spots.filter(s => s.room === name)))
  replay("map", Game.map.visual, visual => {
    for (const [name, tiles] of rooms)
      for (const xy of tiles)
        visual.circle(new RoomPosition(Math.floor(xy / 50), xy % 50, name), { radius: 0.6, fill: PLANNED, opacity: 0.8 })
  })
}

/** Draw with `draw` every REDRAW_TICKS ticks, and replay the cached drawing in between. */
function replay<V extends RoomVisual | MapVisual>(id: string, visual: V, draw: (visual: V) => void): void {
  const cached = cache.get(id)
  if (cached && Game.time - cached.tick < REDRAW_TICKS) {
    visual.import(cached.visual)
    return
  }
  // Only what's drawn here is cached, not other visuals; export() gives undefined, not "", while nothing is drawn.
  const before = (visual.export() ?? "").length
  draw(visual)
  cache.set(id, { tick: Game.time, visual: (visual.export() ?? "").slice(before) })
}

function drawRoom(name: string, visual: RoomVisual, tiles: Set<number>, spots: { spot: { x: number; y: number } }[]) {
  const room = Game.rooms[name]
  const roads = new Set<number>()
  const sites = new Set<number>()
  if (room) {
    for (const s of room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_ROAD }))
      roads.add(s.pos.x * 50 + s.pos.y)
    for (const s of room.find(FIND_MY_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_ROAD }))
      sites.add(s.pos.x * 50 + s.pos.y)
  }

  for (const xy of tiles) {
    const color = roads.has(xy) ? BUILT : sites.has(xy) ? SITE : PLANNED
    visual.circle(Math.floor(xy / 50), xy % 50, { radius: roads.has(xy) ? 0.12 : 0.2, fill: color, opacity: 0.8 })
  }
  for (const { spot } of spots)
    visual.rect(spot.x - 0.4, spot.y - 0.4, 0.8, 0.8, { fill: "transparent", stroke: SITE, strokeWidth: 0.08 })
}
