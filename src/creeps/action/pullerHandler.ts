import PullRequestEvent from "room/pullRequestEvent"
import { pullTo } from "./common/movement"
import { park, unpark } from "./common/parking"
import ICreepHandler from "./ICreepHandler"
import * as creepRoles from "../roles"

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const pullRequest = this.getFirstPullRequest(creep)
    creep.memory.pullTarget = pullRequest?.creepId
    if (!pullRequest) {
      park(creep)
      return
    }
    unpark(creep)

    const target = Game.creeps[pullRequest.creepId]

    if (!target) return

    const targetPos = new RoomPosition(pullRequest.destination.x, pullRequest.destination.y, target.room.name)
    pullTo(creep, target, targetPos)
  }

  /**
   * The request this puller is already serving, else the first one no other puller has claimed whose destination
   * is free (or held by a creep that can be shoved), so one unreachable request can't block the rest. Miners go
   * first: every other role depends on the energy they produce.
   */
  private getFirstPullRequest(creep: Creep): PullRequestEvent | null {
    const claimedByOthers = new Set(
      creep.room
        .find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.PULLER && c.id !== creep.id })
        .map(c => c.memory.pullTarget)
    )

    let fallback: PullRequestEvent | null = null
    for (const event of creep.room.memory.events) {
      if (event.type !== "PULL_REQUEST") continue
      const request = event as PullRequestEvent
      const target = Game.creeps[request.creepId]
      if (!target || claimedByOthers.has(request.creepId)) continue
      if (request.creepId === creep.memory.pullTarget) return request

      const destination = new RoomPosition(request.destination.x, request.destination.y, target.room.name)
      const occupant = destination.lookFor(LOOK_CREEPS)[0]
      const blocked = occupant && occupant.id !== target.id && occupant.id !== creep.id && !canMove(occupant)
      if (blocked) continue

      if (target.memory.role === creepRoles.MINER) return request
      fallback = fallback ?? request
    }
    return fallback
  }
}

declare global {
  interface CreepMemory {
    /** Puller: name of the creep being pulled, so other pullers leave it alone. */
    pullTarget?: string
  }
}

function canMove(creep: Creep): boolean {
  return creep.my && 0 < creep.getActiveBodyparts(MOVE)
}
