import { smartMove } from "creeps/action/common/movement"
import { park } from "creeps/action/common/parking"
import { RemoteSource } from "./remotePlanner"

/** The remote source a creep works (memory.targetSourceId), if it's still mined and its room isn't paused. */
export function remoteOf(creep: Creep): RemoteSource | null {
  const id = (creep.memory as { targetSourceId?: string }).targetSourceId
  const remote = id ? Memory.remotes?.[id] : undefined
  return remote && isRemoteRoomActive(remote.room) ? remote : null
}

export function isRemoteRoomActive(roomName: string): boolean {
  const mined = Object.values(Memory.remotes ?? {}).some(r => r.room === roomName)
  return mined && !Memory.remotePaused?.[roomName]
}

/** Back to the home room, then out of the way there. */
export function sendHome(creep: Creep): void {
  const home = creep.memory.room
  if (creep.room.name !== home) smartMove(creep, new RoomPosition(25, 25, home), 20)
  else park(creep)
}
