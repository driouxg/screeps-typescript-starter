import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import PullRequestEvent from "room/pullRequestEvent"
import { buildDynamicBodyParts } from "./utils/dynamicBodyParts"

export default class PullerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.PULLER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const pullRequestEvent = this.getPendingPullRequest(spawn.room)

    if (!pullRequestEvent) return null

    const pullers = spawn.room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.PULLER })

    if (1 <= pullers.length) return null

    return new SpawnConfig(this.createAppropriateBlueprint(pullRequestEvent, spawn.room), this.role)
  }

  private getPendingPullRequest(room: Room): PullRequestEvent | null {
    for (const req of room.memory.events) if (req.type === "PULL_REQUEST") return req as PullRequestEvent
    return null
  }

  private createAppropriateBlueprint(pullRequest: PullRequestEvent, room: Room): BodyPartConstant[] {
    const creep = Game.creeps[pullRequest.creepId]

    if (!creep) return []

    const targetNumParts = creep.body.length
    if (room.energyAvailable < targetNumParts * BODYPART_COST[MOVE]) return buildDynamicBodyParts([MOVE], room)

    return Array.from({ length: targetNumParts }, (_, _i) => MOVE)
  }
}
