import IEventEmitter from "./IEventEmitter"

export default class SpawnMinerEventEmitter implements IEventEmitter {
  emit(): void {
    throw new Error("Method not implemented.")

    // For every spawn, look for the empty build spot next to it. This is where rapid fillers will go.
  }
}
