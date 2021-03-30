import PullRequestEvent from "room/pullRequestEvent";
import { findCachedStructurePositions } from "utils/structureUtils";
import ICreepHandler from "./ICreepHandler";

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const pullRequest = this.getFirstPullRequest(creep);
    if (!pullRequest) {
      this.idleNearExtension(creep);
      return;
    }

    const target = Game.creeps[pullRequest.creepId];

    if (!target) return;

    const targetPos = new RoomPosition(pullRequest.destination.x, pullRequest.destination.y, target.room.name);
    if (target.pos.isEqualTo(targetPos)) return;

    if (creep.pull(target) === ERR_NOT_IN_RANGE) creep.moveTo(target);
    else {
      target.move(creep);
      if (creep.pos.isEqualTo(targetPos)) creep.move(creep.pos.getDirectionTo(target));
      else creep.moveTo(targetPos);
    }
  }

  private idleNearExtension(creep: Creep): void {
    const extensionPositions = findCachedStructurePositions(creep.room, STRUCTURE_EXTENSION);

    if (extensionPositions.length <= 0) creep.suicide;

    if (!creep.pos.isNearTo(extensionPositions[0].x, extensionPositions[0].y))
      creep.moveTo(extensionPositions[0].x, extensionPositions[0].y);
  }

  private getFirstPullRequest(creep: Creep): PullRequestEvent | null {
    for (const event of creep.room.memory.events) {
      if (event.type === "PULL_REQUEST") return event as PullRequestEvent;
    }
    return null;
  }
}
