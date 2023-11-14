import { UPGRADER } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"

export default class SpawnUpgraderEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % 250 !== 0) return

    Memory.events.push({
      type: "SPAWN",
      role: UPGRADER,
      tick: Game.time,
      handled: false
    } as any)
  }
}
