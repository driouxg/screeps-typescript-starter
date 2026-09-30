import { remoteOf, sendHome } from "remote/remoteCreeps"
import { smartMove } from "./common/movement"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Walk to a remote source (see RemotePlanner) and drop-mine it; remote haulers carry the energy home. Goes home
 * while the room is paused for hostiles, or if the source is no longer mined.
 */
export default class RemoteDropMinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const remote = remoteOf(creep)
    if (!remote) return sendHome(creep)

    const pos = new RoomPosition(remote.x, remote.y, remote.room)
    if (creep.room.name !== remote.room || !creep.pos.isNearTo(pos)) {
      smartMove(creep, pos, 1)
      return
    }
    const source = Game.getObjectById(remote.id as Id<Source>)
    if (source) creep.harvest(source)
  }
}

export interface RemoteDropMinerMemory extends CreepMemory {
  targetSourceId: string
}
