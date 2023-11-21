import { EXPANDER } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"
import { myClaimedRoom } from "utils/roomUtils"

export default class SpawnExpanderEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 530 !== 0) return

    for (let roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!room) continue
      if (!myClaimedRoom(room)) continue
      // if (2 <= this.creepPopulationDict[creepRoles.EXPANDER]) return null

      const myConstructionSites = room.find(FIND_CONSTRUCTION_SITES, {
        filter: c => c.owner.username === "DryOx" && c.structureType === STRUCTURE_SPAWN
      })

      if (myConstructionSites.length <= 0) continue

      Memory.events.push({
        type: "SPAWN",
        role: EXPANDER,
        handled: false,
        targetRoomName: room.name
      } as any)
    }
  }
}
