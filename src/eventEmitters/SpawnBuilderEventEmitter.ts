import { BUILDER } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"
import { myClaimedRoom } from "utils/roomUtils"
import { BuilderMemory } from "creeps/action/BuilderHandler"

export default class SpawnBuilderEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 100 !== 0) return

    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!myClaimedRoom(room)) continue

      const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)

      if (constructionSites.length <= 0) continue

      const builders = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === BUILDER })

      if (3 <= builders.length) continue

      const c = constructionSites[0].pos

      Memory.events.push({
        type: "SPAWN",
        role: BUILDER,
        buildTargetPos: { x: c.x, y: c.y, roomName: c.roomName }
      } as any)
    }
  }
}
