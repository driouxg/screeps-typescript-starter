import ScoutMemory from "creeps/memory/scoutMemory"
import CreepBehavior from "./common/creepBehavior"
import ICreepHandler from "./ICreepHandler"

/**
 * Goal: Explore to random rooms, if claimable, claim the controller.
 *
 */
export default class ScoutHandler implements ICreepHandler {
  private creepBehavior: CreepBehavior

  public constructor(commonCreepBehavior: CreepBehavior) {
    this.creepBehavior = commonCreepBehavior
  }

  handle(creep: Creep): void {
    const memory = creep.memory as ScoutMemory
    memory.lastScoutedDict = memory.lastScoutedDict ?? {}
    memory.targetRoom = memory.targetRoom ?? creep.memory.room

    if (creep.room.name === memory.targetRoom) {
      creep.moveTo(25, 25) // Move creep off of border
      memory.lastScoutedDict[creep.room.name] = Game.time

      if (!this.isClaimableRoom(creep.room)) {
        memory.targetRoom = this.findNewTargetRoom(creep)
        return
      }

      const controller = creep.room.controller as StructureController
      const status = creep.claimController(controller)
      if (status === ERR_NOT_IN_RANGE) this.creepBehavior.moveToWithSinglePath(creep, controller.pos)
      if (status === ERR_GCL_NOT_ENOUGH) memory.targetRoom = this.findNewTargetRoom(creep) // This might cause my bases to be built far away from eachother
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

      console.log("Found new room to explore: ", roomName)
      return roomName
    }

    console.log("Found new room to explore: ", memory.targetRoom)

    return memory.targetRoom
  }

  private isClaimableRoom(room: Room | undefined) {
    return (
      room &&
      room.controller &&
      !room.controller?.owner &&
      room.controller.reservation?.username === "DryOx" &&
      room.find(FIND_HOSTILE_CREEPS).length <= 0 &&
      Game.map.getRoomStatus(room.name)
    )
  }
}
