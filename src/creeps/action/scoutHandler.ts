import ScoutMemory from "creeps/memory/scoutMemory"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Explore to random rooms, if claimable, claim the controller.
 */
export default class ScoutHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    memory.lastScoutedDict = memory.lastScoutedDict ?? {}
    memory.targetRoom = memory.targetRoom ?? creep.memory.room

    if (creep.room.name === memory.targetRoom) {
      creep.moveTo(25, 25) // Move creep off of border
      memory.lastScoutedDict[creep.room.name] = Game.time

      memory.targetRoom = this.findNewTargetRoom(creep)
    } else creep.moveTo(new RoomPosition(25, 25, memory.targetRoom))
  }

  private findNewTargetRoom(creep: Creep): string {
    const exits = Game.map.describeExits(creep.room.name)
    const rooms = Object.keys(exits).map(direction => exits[direction as ExitKey])
    let memory = creep.memory as ScoutMemory
    rooms.sort(() => Math.random() - 0.5)

    for (const roomName of rooms) {
      if (!roomName) continue

      const lastScouted = memory.lastScoutedDict[roomName]

      if (Game.time < lastScouted - 600) continue

      return roomName
    }

    return memory.targetRoom
  }
}
