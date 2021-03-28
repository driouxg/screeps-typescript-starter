import PullRequestEvent from "room/pullRequestEvent";
import ICreepHandler from "./ICreepHandler";

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    for (const event of creep.room.memory.events) {
      if (event.type !== "PULL_REQUEST") continue;

      const pullRequest = event as PullRequestEvent;
      const target = Game.creeps[pullRequest.creepId];

      if (!target) continue;

      if (creep.pull(target) === ERR_NOT_IN_RANGE) creep.moveTo(target);
      else {
        target.move(creep);
        const targetPos = new RoomPosition(pullRequest.destination.x, pullRequest.destination.y, target.room.name);
        if (creep.pos.isEqualTo(targetPos)) creep.move(creep.pos.getDirectionTo(target));
        else creep.moveTo(targetPos);
      }
    }
  }
}
