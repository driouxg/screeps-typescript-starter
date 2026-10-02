import { isHostile } from "config/relations"
import { isCombatant } from "defence/threat"
import { smartMove } from "./common/movement"
import { loiter, stopLoitering } from "./common/loiter"
import { park } from "./common/parking"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Kill hostiles in our room, fighters first. Stay inside the room (chasing raiders out through an exit just
 * splits our defence). With nothing to fight, wait near where the hostiles died (see loiter), out of the way, or
 * park.
 */
export default class MeleeDefenderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS, {
      filter: h => !isOnEdge(h.pos) && isHostile(h)
    })
    const fighters = hostiles.filter(isCombatant)
    const enemy = creep.pos.findClosestByRange(0 < fighters.length ? fighters : hostiles)

    if (!enemy) {
      if (!loiter(creep)) park(creep)
      return
    }
    stopLoitering(creep)

    if (creep.attack(enemy) === ERR_NOT_IN_RANGE) smartMove(creep, enemy, 1)
  }
}

function isOnEdge(pos: RoomPosition): boolean {
  return pos.x <= 0 || 49 <= pos.x || pos.y <= 0 || 49 <= pos.y
}
