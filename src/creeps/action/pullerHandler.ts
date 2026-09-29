import PullRequestEvent from "room/pullRequestEvent"
import { findCachedStructurePositions } from "utils/structureUtils"
import { clearTile, smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const pullRequest = this.getFirstPullRequest(creep)
    if (!pullRequest) {
      this.idleNearExtension(creep)
      return
    }

    const target = Game.creeps[pullRequest.creepId]

    if (!target) return

    const targetPos = new RoomPosition(pullRequest.destination.x, pullRequest.destination.y, target.room.name)
    if (target.pos.isEqualTo(targetPos)) return

    if (creep.pull(target) === ERR_NOT_IN_RANGE) smartMove(creep, target, 1)
    else {
      target.move(creep)
      if (creep.pos.isEqualTo(targetPos)) creep.move(creep.pos.getDirectionTo(target))
      else {
        if (creep.pos.isNearTo(targetPos)) clearTile(targetPos)
        smartMove(creep, targetPos, 0)
      }
    }
  }

  private idleNearExtension(creep: Creep): void {
    const extensionPositions = findCachedStructurePositions(creep.room, STRUCTURE_EXTENSION)
    if (extensionPositions.length <= 0) return

    smartMove(creep, extensionPositions[0], 2)
  }

  /**
   * First pull request whose destination is free (or held by a creep that can be shoved), so one unreachable
   * request can't block the rest.
   */
  private getFirstPullRequest(creep: Creep): PullRequestEvent | null {
    for (const event of creep.room.memory.events) {
      if (event.type !== "PULL_REQUEST") continue
      const request = event as PullRequestEvent
      const target = Game.creeps[request.creepId]
      if (!target) continue

      const destination = new RoomPosition(request.destination.x, request.destination.y, target.room.name)
      const occupant = destination.lookFor(LOOK_CREEPS)[0]
      const blocked = occupant && occupant.id !== target.id && occupant.id !== creep.id && !canMove(occupant)
      if (!blocked) return request
    }
    return null
  }
}

function canMove(creep: Creep): boolean {
  return creep.my && 0 < creep.getActiveBodyparts(MOVE)
}
