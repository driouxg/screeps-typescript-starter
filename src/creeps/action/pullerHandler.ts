import PullRequestEvent from "room/pullRequestEvent";
import ICreepHandler from "./ICreepHandler";

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const pullRequest = this.getFirstPullRequest(creep);
    if (!pullRequest) {
      creep.suicide();
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

  private getFirstPullRequest(creep: Creep): PullRequestEvent | null {
    for (const event of creep.room.memory.events) {
      if (event.type === "PULL_REQUEST") return event as PullRequestEvent;
    }
    return null;
  }
}
