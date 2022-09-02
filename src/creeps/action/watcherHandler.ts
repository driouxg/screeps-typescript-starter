import WatcherMemory from "creeps/memory/watcherMemory"
import { isEdge } from "utils/gridBuilder"
import { moveToWithSinglePath } from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

export default class WatcherHandler implements ICreepHandler {
  handle(creep: Creep): void {
    let memory = creep.memory as WatcherMemory

    if (creep.room.name === memory.targetRoomName && !isEdge(creep.pos.x, creep.pos.y)) return

    moveToWithSinglePath(creep, new RoomPosition(25, 25, memory.targetRoomName))
  }
}
