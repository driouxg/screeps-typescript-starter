import IEventEmitter from "./IEventEmitter"
import { getAdjacent, getRoomsWithinDistance, isWall, myClaimedRoom } from "utils/roomUtils"
import { MINER } from "creeps/roles"
import { MinerMemory } from "creeps/action/MinerHandler"

export default class SpawnMinerEventEmitter implements IEventEmitter {
  emit(): void {
    handleMinerCloseToDeath()
    handleSourceWithNoMiners()
  }
}

function handleMinerCloseToDeath() {
  if (Game.time % 100 !== 0) return

  for (const creepName in Game.creeps) {
    const creep = Game.creeps[creepName]

    if (creep.memory.role !== MINER) continue

    if (100 <= creep.ticksToLive!) continue

    console.log("SPAWNING MINER TO REPLACE OTHER MINER")

    Memory.events.push({
      type: "SPAWN",
      role: MINER,
      tick: Game.time,
      handled: false,
      targetSourceId: (creep.memory as MinerMemory).targetSourceId
    } as any)
  }
}

function handleSourceWithNoMiners() {
  if (Game.time % 150 !== 0) return

  for (const spawnName in Game.spawns) {
    const spawn = Game.spawns[spawnName]

    // TODO: Get rooms within 2 room distance, if mineable spawn miner
    const roomNames = getRoomsWithinDistance(spawn.room, 2)

    for (const roomName of roomNames) {
      const room = Game.rooms[roomName]

      if (!room) continue

      if (!isMineableRoom(room)) continue

      const sources = room.find(FIND_SOURCES)

      sources.forEach(source => {
        const miners = source.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c.memory.role === MINER })
        if (3 <= miners.length) return

        const workParts = miners.reduce((acc, miner) => acc + miner.getActiveBodyparts(WORK), 0)
        if (5 <= workParts) return

        const emptySpots = getAdjacent(source.pos).filter(a => isEmptyMinerSpot(a))
        if (emptySpots.length <= 0) return

        Memory.events.push({
          type: "SPAWN",
          role: MINER,
          handled: false,
          targetSourceId: source.id
        } as any)
      })
    }
  }

  // look at resources of spawns and nearby rooms, if no miner next to it, emit event
  // for (const roomName in Game.rooms) {
  //   const room = Game.rooms[roomName]
  //   if (!isMineableRoom(room)) continue

  //   const sources = room.find(FIND_SOURCES)

  //   sources.forEach(source => {
  //     const miners = source.pos.findInRange(FIND_MY_CREEPS, 1, { filter: c => c.memory.role === MINER })
  //     if (3 <= miners.length) return

  //     const workParts = miners.reduce((acc, miner) => acc + miner.getActiveBodyparts(WORK), 0)
  //     if (5 <= workParts) return

  //     const emptySpots = getAdjacent(source.pos).filter(a => isEmptyMinerSpot(a))
  //     if (emptySpots.length <= 0) return

  //     Memory.events.push({
  //       type: "SPAWN",
  //       role: MINER,
  //       handled: false,
  //       targetSourceId: source.id
  //     } as any)
  //   })
  // }
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
