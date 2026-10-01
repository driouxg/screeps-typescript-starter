import { isHostile } from "config/relations"
import { isEdge } from "utils/gridBuilder"
import { defencesBelow, isDefence, RAMPART_CRITICAL_HITS, RAMPART_MIN_HITS } from "structures/rampartPolicy"
import { DEFENCE_MIN_RCL } from "structures/construction/buildOrderConstructor"
import IStructureActionHandler from "./IStructureActionHandler"

/** Energy a tower keeps for defence; only the surplus goes into repairs. */
const DEFENCE_RESERVE = 500
/**
 * Haulers keep every tower at least this full ahead of spawns and extensions (see findOffloadSpot); without it, a
 * room spawning big creeps keeps its towers near empty. It's the defence reserve itself: repairs only use energy above
 * it, delivered at low priority, so priority deliveries never turn into repairs (which kept haulers busy refilling
 * towers that spent it straight away, and stalled the economy).
 */
export const TOWER_MIN_STOCK = DEFENCE_RESERVE
/** Even a rampart about to decay away isn't worth leaving a tower unable to shoot. */
const EMERGENCY_RESERVE = 200
/** Other structures (roads, containers, ...) are repaired once below this share of their hits. */
const REPAIR_BELOW = 0.8

/**
 * Goal: Towers defend first (attack hostiles, healers first), then heal our creeps, then (from DEFENCE_MIN_RCL)
 * keep ramparts and walls alive: those about to decay away out of anything above EMERGENCY_RESERVE, the rest below
 * RAMPART_MIN_HITS out of energy above DEFENCE_RESERVE. Then, out of energy above DEFENCE_RESERVE, other structures
 * below REPAIR_BELOW of their hits, most damaged first: from RCL 3 builders leave repairs to towers and build (see
 * BuilderHandler).
 * Reinforcing ramparts beyond RAMPART_MIN_HITS is left to builders, which repair at a fraction of the cost.
 */
export default class TowerActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[]
    if (towers.length <= 0) return

    const enemies = room.find(FIND_HOSTILE_CREEPS, {
      filter: c => !isEdge(c.pos.x, c.pos.y) && isHostile(c)
    })
    if (0 < enemies.length) {
      const healers = enemies.filter(c => 0 < c.getActiveBodyparts(HEAL))
      const target = healers[0] ?? enemies[0]
      towers.forEach(t => t.attack(target))
      return
    }

    const wounded = room.find(FIND_MY_CREEPS, { filter: c => c.hits < c.hitsMax })
    if (0 < wounded.length) {
      towers.forEach(t => t.heal(t.pos.findClosestByRange(wounded)!))
      return
    }

    // Before DEFENCE_MIN_RCL ramparts and walls aren't kept up at all (they're rebuilt then): the energy goes into
    // growing the room, and safe mode covers attacks.
    const keepDefences = DEFENCE_MIN_RCL <= (room.controller?.level ?? 0)
    const critical = keepDefences ? defencesBelow(room, RAMPART_CRITICAL_HITS) : []
    const low = keepDefences ? defencesBelow(room, RAMPART_MIN_HITS) : []
    const share = (s: Structure) => s.hits / s.hitsMax
    const damaged = room
      .find(FIND_STRUCTURES, { filter: s => !isDefence(s) && share(s) < REPAIR_BELOW })
      .sort((a, b) => share(a) - share(b))
    for (const tower of towers) {
      // A repair may not take the tower below the reserve: one that dipped under TOWER_MIN_STOCK would be refilled
      // ahead of the spawn, and spend the refill on the next repair, over and over.
      const canSpend = (reserve: number) => reserve <= tower.store.energy - TOWER_ENERGY_COST
      const target =
        (canSpend(EMERGENCY_RESERVE) && critical[0]) ||
        (canSpend(DEFENCE_RESERVE) && (low[0] || damaged[0])) ||
        undefined
      if (target) tower.repair(target)
    }
  }
}
