import { SCOUT } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"
import { CREEP_LIFETIME } from "creeps/common/creepBehavior"

export default class SpawnScoutEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % CREEP_LIFETIME !== 0) return

    Memory.events.push({
      type: "SPAWN",
      role: SCOUT,
      handled: false
    } as any)
  }
}
