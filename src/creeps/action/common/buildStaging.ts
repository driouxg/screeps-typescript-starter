import * as creepRoles from "creeps/roles"
import { priorityOf } from "structures/construction/buildOrderConstructor"

/**
 * Goal: Bring the energy to the builders instead of the builders to the energy.
 *
 * Builders otherwise walk to the source piles and back for every load, which in a swampy room leaves them building
 * a few ticks out of every fifty. Haulers instead drop energy on a staging tile next to the construction site the
 * builders are working on, so each refill is a few steps.
 */

/** Don't stockpile more than this at the staging tile; the rest goes to the controller as usual. */
const STAGING_MAX = 600
/** Drop within building range (3) of the site, but not on or right next to it where builders stand. */
const STAGING_RANGE = 2

declare global {
  interface RoomMemory {
    buildStaging?: { siteId: string; x: number; y: number }
  }
}

/**
 * Where haulers should drop energy for builders, or null when there's nothing to build, no builders, or the staging
 * tile already holds enough.
 */
export function buildStagingPos(room: Room): RoomPosition | null {
  const builders = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.BUILDER })
  if (builders.length <= 0) return null

  let staging = room.memory.buildStaging
  if (!staging || !Game.getObjectById(staging.siteId as Id<ConstructionSite>)) {
    staging = pickStaging(room)
    room.memory.buildStaging = staging
  }
  if (!staging) return null

  const pos = new RoomPosition(staging.x, staging.y, room.name)
  const stocked = pos.lookFor(LOOK_ENERGY).reduce((sum, r) => sum + r.amount, 0)
  return stocked < STAGING_MAX ? pos : null
}

function pickStaging(room: Room): { siteId: string; x: number; y: number } | undefined {
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES)
  if (sites.length <= 0) return undefined

  // The site builders work on first: highest build priority, then most progressed (see BuilderHandler).
  const priority = (s: ConstructionSite) => priorityOf(room, s.pos, s.structureType)
  const site = sites.sort(
    (a, b) => priority(a) - priority(b) || b.progress / b.progressTotal - a.progress / a.progressTotal
  )[0]

  const terrain = room.getTerrain()
  const spawns = room.find(FIND_MY_SPAWNS)
  const planned = new Set((room.memory.buildOrder || []).map(s => `${s.x},${s.y}`))
  for (let dy = -STAGING_RANGE; dy <= STAGING_RANGE; dy++) {
    for (let dx = -STAGING_RANGE; dx <= STAGING_RANGE; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== STAGING_RANGE) continue
      const x = site.pos.x + dx
      const y = site.pos.y + dy
      if (x < 2 || 47 < x || y < 2 || 47 < y || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
      // Keep it off planned buildings (the pile would sit on a future site) and away from the spawn's doorstep.
      if (planned.has(`${x},${y}`) || spawns.some(s => s.pos.inRangeTo(x, y, 1))) continue
      const pos = new RoomPosition(x, y, room.name)
      if (0 < pos.lookFor(LOOK_STRUCTURES).length || 0 < pos.lookFor(LOOK_CONSTRUCTION_SITES).length) continue
      return { siteId: site.id, x, y }
    }
  }
  return undefined
}
