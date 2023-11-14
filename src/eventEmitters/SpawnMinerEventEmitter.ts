import IEventEmitter from "./IEventEmitter"
import { getAdjacent, isWall, myClaimedRoom } from "utils/roomUtils"
import { MINER } from "creeps/roles"

export default class SpawnMinerEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 10 !== 0) return
    // look at resources of spawns and nearby rooms, if no miner next to it, emit event

    console.log("REACHED!!!!")

    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (!isMineableRoom(room)) continue

      const sources = room.find(FIND_SOURCES)

      sources.forEach(source => {
        for (const pos of getAdjacent(source.pos)) {
          if (!isEmptyMinerSpot(pos)) continue
          Memory.events.push({
            type: "SPAWN",
            role: MINER,
            tick: Game.time,
            handled: false,
            targetSourceId: source.id
          } as any)
        }
      })
    }
  }
}

function isMineableRoom(room: Room) {
  return myClaimedRoom(room) || ["claimable", "reservedMy", "claimedMy"].includes(room.memory.status)
}

function isEmptyMinerSpot(pos: RoomPosition) {
  return (
    !isWall(pos.x, pos.y, pos.roomName) &&
    pos.lookFor(LOOK_CREEPS).length === 0 &&
    pos.lookFor(LOOK_STRUCTURES).length === 0
  )
}
