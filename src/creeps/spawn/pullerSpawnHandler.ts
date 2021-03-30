import ISpawnHandler from "./ISpawnHandler";
import SpawnConfig from "./SpawnConfig";
import * as creepRoles from "../roles";
import PullRequestEvent from "room/pullRequestEvent";

export default class PullerSpawnHandler implements ISpawnHandler {
  private creepPopulationDict: { [key: string]: number };
  private nextSpawnHandler: ISpawnHandler;
  private role: string = creepRoles.PULLER;

  public constructor(creepPopulationDict: { [key: string]: number }, nextSpawnHandler: ISpawnHandler) {
    this.creepPopulationDict = creepPopulationDict;
    this.nextSpawnHandler = nextSpawnHandler;
  }

  spawnCreep(room: Room): SpawnConfig {
    const pullRequestEvent = this.getPendingPullRequest(room);

    if (!pullRequestEvent) return this.nextSpawnHandler.spawnCreep(room);

    if (this.creepPopulationDict[this.role] < 1)
      return new SpawnConfig(this.createAppropriateBlueprint(pullRequestEvent), this.role);
    else return this.nextSpawnHandler.spawnCreep(room);
  }

  private getPendingPullRequest(room: Room): PullRequestEvent | null {
    for (const req of room.memory.events) if (req.type === "PULL_REQUEST") return req as PullRequestEvent;
    return null;
  }

  private createAppropriateBlueprint(pullRequest: PullRequestEvent): BodyPartConstant[] {
    return Array.from({ length: Game.creeps[pullRequest.creepId].body.length }, (_, _) => MOVE);
  }
}
