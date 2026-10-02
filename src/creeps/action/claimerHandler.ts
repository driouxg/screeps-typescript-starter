import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Walk to the expansion target and claim its controller. The ExpansionPlanner notices the claim (or gives up
 * on the target) and moves on.
 */
export default class ClaimerHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const memory = creep.memory as ClaimerMemory
    // Follow the expansion if its target changes on the way (the player picked another room from the dashboard).
    const target = Memory.expansion?.state === "claiming" ? Memory.expansion.target : memory.targetRoom
    if (!target) return

    if (creep.room.name !== target) {
      smartMove(creep, new RoomPosition(25, 25, target), 20)
      return
    }

    const controller = creep.room.controller
    if (!controller || controller.my) return

    const code = creep.claimController(controller)
    if (code === ERR_NOT_IN_RANGE) smartMove(creep, controller, 1)
    else if (code === ERR_GCL_NOT_ENOUGH) creep.suicide()
    else if (code === ERR_INVALID_TARGET && controller.reservation) {
      // Reserved by someone else: wear the reservation down, then claim.
      if (creep.attackController(controller) === ERR_NOT_IN_RANGE) smartMove(creep, controller, 1)
    }
  }
}

export interface ClaimerMemory extends CreepMemory {
  targetRoom: string
}
