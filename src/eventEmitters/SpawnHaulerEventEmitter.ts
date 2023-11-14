import { HAULER, MINER } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"
import { SpawnEvent } from "utils/Event"

/**
 * Goal: Look at all miners, if miner has had a resource pile below them greater than 500, get a hauler to pick it up
 */
export default class SpawnHaulerEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 25 !== 0) return

    for (const creepName in Game.creeps) {
      const creep: Creep = Game.creeps[creepName]

      if (creep.memory.role !== MINER) continue

      const energy = creep.pos.lookFor(LOOK_ENERGY).reduce((acc, val) => acc + val.amount, 0)

      if (energy <= 500) continue

      Memory.events.push({
        type: "SPAWN",
        role: HAULER,
        tick: Game.time,
        handled: false,
        targetRoomName: creep.pos.roomName
      } as SpawnEvent)
    }
  }
}
