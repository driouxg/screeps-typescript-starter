import PullRequestEvent from "room/pullRequestEvent"
import { isStandable } from "utils/standable"
import { pullTo, smartMove } from "./common/movement"
import { park, unpark } from "./common/parking"
import ICreepHandler from "./ICreepHandler"
import * as creepRoles from "../roles"

/** A tow still not done after this long is given up on (the destination can't be reached)... */
const PULL_TIMEOUT = 300
/** ...and that creep's requests are ignored for this long, so the puller serves others meanwhile. */
const SKIP_TICKS = 500

export default class PullerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    // Pull requests are per room: one that ended up next door (pushed over the exit) would wait there for good, while
    // home spawned another in its place.
    if (creep.room.name !== creep.memory.room) {
      smartMove(creep, new RoomPosition(25, 25, creep.memory.room), 20)
      return
    }
    const pullRequest = this.getFirstPullRequest(creep)
    this.track(creep, pullRequest)
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
   * Remember which creep we're towing and since when; give up on it after PULL_TIMEOUT ticks and skip its requests for
   * SKIP_TICKS.
   */
  private track(creep: Creep, request: PullRequestEvent | null): void {
    const memory = creep.memory
    if (!request) {
      delete memory.pullTarget
      delete memory.pullSince
      return
    }
    if (memory.pullTarget !== request.creepId) {
      memory.pullTarget = request.creepId
      memory.pullSince = Game.time
    }
    if (PULL_TIMEOUT < Game.time - (memory.pullSince ?? Game.time)) {
      console.log(
        `Puller ${creep.name}: giving up on towing ${request.creepId} to ${JSON.stringify(request.destination)}`
      )
      memory.pullSkip = { ...(memory.pullSkip ?? {}), [request.creepId]: Game.time + SKIP_TICKS }
      delete memory.pullTarget
      delete memory.pullSince
    }
  }

  /**
   * The request this puller is already serving, else the first one no other puller has claimed whose destination a
   * creep can stand on and is free (or held by a creep that can be shoved), so one unreachable request can't block the
   * rest. Miners go first: every other role depends on the energy they produce.
   */
  private getFirstPullRequest(creep: Creep): PullRequestEvent | null {
    const claimedByOthers = new Set(
      creep.room
        .find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.PULLER && c.id !== creep.id })
        .map(c => c.memory.pullTarget)
    )
    const skip = creep.memory.pullSkip ?? {}
    for (const name in skip) if (skip[name] <= Game.time) delete skip[name]

    let fallback: PullRequestEvent | null = null
    for (const event of creep.room.memory.events) {
      if (event.type !== "PULL_REQUEST") continue
      const request = event as PullRequestEvent
      const target = Game.creeps[request.creepId]
      if (!target || claimedByOthers.has(request.creepId) || skip[request.creepId]) continue

      // Never try to tow onto a wall or a structure: it can't be done, however long we try.
      const { x, y } = request.destination
      if (!isStandable(target.room, x, y)) continue
      if (request.creepId === creep.memory.pullTarget) return request

      const destination = new RoomPosition(x, y, target.room.name)
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
    /** Puller: tick it started towing pullTarget. */
    pullSince?: number
    /** Puller: creeps whose requests to ignore until the given tick (a tow to them timed out). */
    pullSkip?: { [creepName: string]: number }
  }
}

function canMove(creep: Creep): boolean {
  return creep.my && 0 < creep.getActiveBodyparts(MOVE)
}
