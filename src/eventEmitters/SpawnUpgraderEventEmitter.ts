import { UPGRADER } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"
import { myClaimedRoom } from "utils/roomUtils"

export default class SpawnUpgraderEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 100 !== 0) return

    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!myClaimedRoom(room)) continue

      const creeps = room.find(FIND_MY_CREEPS)

      if (creeps.length <= 7) continue

      const upgraders = creeps.filter(c => c.memory.role === UPGRADER)

      if (3 < upgraders.length) continue

      Memory.events.push({
        type: "SPAWN",
        role: UPGRADER,
        tick: Game.time,
        handled: false
      } as any)
    }
  }
}
