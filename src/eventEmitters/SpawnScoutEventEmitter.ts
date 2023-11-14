import { SCOUT } from "creeps/roles"
import IEventEmitter from "./IEventEmitter"

const SCREEP_LIFETIME = 1500

export default class SpawnScoutEventEmitter implements IEventEmitter {
  emit(): void {
    if (Game.time % SCREEP_LIFETIME !== 0) return

    Memory.events.push({
      type: "SPAWN",
      role: SCOUT,
      handled: false
    } as any)
  }
}
