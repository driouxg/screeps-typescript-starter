/**
 * Goal: Let creeps cross source keeper rooms without getting hit.
 *
 * A keeper walks to within 1 tile of the source or mineral it guards (one within 5 tiles of its lair), stays there,
 * and attacks anything within 3 tiles; it never chases. So:
 * - tiles within KEEPER_RANGE of a keeper we can see away from its post (e.g. walking out of its lair) are impassable;
 * - tiles within KEEPER_RANGE + 1 of a keeper's post (its lair, or the resource it guards) cost KEEPER_POST_COST, so
 *   paths go around them, even without vision, but a narrow room can still be crossed if there's no other way.
 */

const KEEPER = "Source Keeper"
const KEEPER_RANGE = 3
/** Keeper's post: it stands within 1 of the resource it guards, so its reach is one tile further. */
const POST_RANGE = KEEPER_RANGE + 1
const KEEPER_POST_COST = 40
/** A resource within this range of a lair is guarded by that lair's keeper. */
const GUARD_RANGE = 5

/** Lairs plus the sources and minerals they guard, as recorded in intel. */
export function keeperPosts(room: Room): { x: number; y: number }[] {
  const lairs = room.find(FIND_HOSTILE_STRUCTURES, { filter: s => s.structureType === STRUCTURE_KEEPER_LAIR })
  if (lairs.length <= 0) return []
  const resources = [...room.find(FIND_SOURCES), ...room.find(FIND_MINERALS)]
  const guarded = resources.filter(r => lairs.some(l => l.pos.inRangeTo(r, GUARD_RANGE)))
  return [...lairs, ...guarded].map(o => ({ x: o.pos.x, y: o.pos.y }))
}

/**
 * Add keeper danger to a path cost matrix for `roomName`: posts from intel (or live, with vision) and, with vision,
 * the keepers themselves. Never lowers a cost, and never makes a wall walkable.
 */
export function applyKeeperCosts(roomName: string, matrix: CostMatrix): CostMatrix {
  const room = Game.rooms[roomName]
  const posts = room ? keeperPosts(room) : Memory.rooms?.[roomName]?.intel?.keeperPosts ?? []
  const keepers = room ? room.find(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username === KEEPER }) : []
  if (posts.length <= 0 && keepers.length <= 0) return matrix

  const terrain = Game.map.getRoomTerrain(roomName)
  const raise = (cx: number, cy: number, range: number, cost: number) => {
    for (let y = Math.max(0, cy - range); y <= Math.min(49, cy + range); y++)
      for (let x = Math.max(0, cx - range); x <= Math.min(49, cx + range); x++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue
        if (matrix.get(x, y) < cost) matrix.set(x, y, cost)
      }
  }
  for (const p of posts) raise(p.x, p.y, POST_RANGE, KEEPER_POST_COST)
  // A keeper idle at its post reaches no further than the post's zone above, so it adds nothing: paths must cost the
  // same with vision as without, or a creep routed through the room (from intel) reroutes once it sees the keeper,
  // leaves, loses vision and routes back in, walking back and forth. Only a keeper away from its post (walking out
  // of its lair) blocks its reach.
  const atPost = (k: Creep) => posts.some(p => Math.max(Math.abs(k.pos.x - p.x), Math.abs(k.pos.y - p.y)) <= 1)
  for (const k of keepers) if (!atPost(k)) raise(k.pos.x, k.pos.y, KEEPER_RANGE, 0xff)
  return matrix
}
