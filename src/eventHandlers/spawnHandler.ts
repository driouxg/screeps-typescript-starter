import Event, { SpawnEvent } from "utils/Event"
import IEventHandler from "./IEventHandler"
import SpawnConfig from "creeps/spawnConfig"
import generateGuid from "utils/guidGenerator"
import { BUILDER, HAULER, MINER, SCOUT, UPGRADER } from "creeps/roles"
import { MinerMemory } from "creeps/action/MinerHandler"
import { HaulerMemory } from "creeps/action/HaulerHandler"

export default class SpawnHandler implements IEventHandler {
  maxSpawnStore = 300
  maxNumBodyParts = 50

  handle(event: Event): void {
    if (event.type !== "SPAWN") return

    const typedEvent = event as SpawnEvent

    for (const spawnName in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnName]
      if (spawn.spawning) continue

      typedEvent.handled = true

      switch (typedEvent.role) {
        case MINER:
          this.spawn(
            spawn,
            new SpawnConfig(this.buildCappedBodyParts([WORK, WORK, MOVE], spawn.room, 5), MINER, {
              memory: {
                targetSourceId: typedEvent.targetSourceId
              } as MinerMemory
            })
          )
          break
        case HAULER:
          this.spawn(
            spawn,
            new SpawnConfig(this.buildCappedBodyParts([CARRY, MOVE], spawn.room, 25), HAULER, {
              memory: {
                pickupRoomName: typedEvent.targetRoomName,
                offloadRoomName: spawn.room.name
              } as HaulerMemory
            })
          )
          break
        case SCOUT:
          this.spawn(spawn, new SpawnConfig([MOVE], SCOUT))
          break
        case UPGRADER:
          this.spawn(spawn, new SpawnConfig(this.buildCappedBodyParts([WORK], spawn.room, 10, [CARRY, MOVE]), UPGRADER))
          break
        case BUILDER:
          this.spawn(
            spawn,
            new SpawnConfig(this.buildCappedBodyParts([WORK, WORK, CARRY, MOVE], spawn.room, 15), BUILDER)
          )
          break
        default:
          typedEvent.handled = false
      }
    }
  }

  private spawn(spawn: StructureSpawn, spawnConfig: SpawnConfig) {
    if (!spawnConfig || spawnConfig.getBody().length === 0) return
    const cost = spawnConfig.getBody().reduce((acc, val) => acc + BODYPART_COST[val], 0)
    if (spawn.room.energyAvailable < cost) return

    console.log("Spawning", spawnConfig.getRole(), spawn.room.name)

    spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
      memory: {
        role: spawnConfig.getRole(),
        working: false,
        room: spawn.room.name,
        ...spawnConfig.getMemory()
      },
      ...(spawnConfig.getDirections() || {})
    })
  }

  buildDynamicBodyParts(
    bluePrint: BodyPartConstant[],
    room: Room,
    minBluePrint?: BodyPartConstant[]
  ): BodyPartConstant[] {
    return this.buildCappedBodyParts(bluePrint, room, this.maxNumBodyParts, minBluePrint)
  }

  buildCappedBodyParts(
    bluePrint: BodyPartConstant[],
    room: Room,
    numPartsCap: number,
    minBluePrint?: BodyPartConstant[]
  ): BodyPartConstant[] {
    if (room.energyAvailable < this.maxSpawnStore) return []

    bluePrint.sort((b1, b2) => BODYPART_COST[b1] - BODYPART_COST[b2])

    let parts = minBluePrint || []
    let cost = minBluePrint ? minBluePrint.reduce((acc, val) => acc + BODYPART_COST[val], 0) : 0
    let idx = 0

    while (parts.length < numPartsCap && cost + BODYPART_COST[bluePrint[idx]] <= room.energyAvailable) {
      parts.push(bluePrint[idx])
      cost += BODYPART_COST[bluePrint[idx]]
      idx = (idx + 1) % bluePrint.length
    }

    return parts
  }
}
