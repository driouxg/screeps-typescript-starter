import { isAlly } from "config/allies"
import { isEdge } from "utils/gridBuilder"
import { defencesBelow, RAMPART_CRITICAL_HITS, RAMPART_MIN_HITS } from "structures/rampartPolicy"
import IStructureActionHandler from "./IStructureActionHandler"

/** Energy a tower keeps for defence; only the surplus goes into repairs. */
const DEFENCE_RESERVE = 500
/** Even a rampart about to decay away isn't worth leaving a tower unable to shoot. */
const EMERGENCY_RESERVE = 200

/**
 * Goal: Towers defend first (attack hostiles, healers first), then heal our creeps, then keep ramparts and walls
 * alive: those about to decay away out of anything above EMERGENCY_RESERVE, the rest below RAMPART_MIN_HITS out of
 * energy above DEFENCE_RESERVE. Reinforcing beyond that is left to builders, which repair at a tenth of the cost.
 */
export default class TowerActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[]
    if (towers.length <= 0) return

    const enemies = room.find(FIND_HOSTILE_CREEPS, {
      filter: c => !isEdge(c.pos.x, c.pos.y) && !isAlly(c.owner.username)
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

    const critical = defencesBelow(room, RAMPART_CRITICAL_HITS)
    const low = defencesBelow(room, RAMPART_MIN_HITS)
    for (const tower of towers) {
      const energy = tower.store.energy
      const target = (EMERGENCY_RESERVE < energy && critical[0]) || (DEFENCE_RESERVE < energy && low[0]) || undefined
      if (target) tower.repair(target)
    }
  }
}
