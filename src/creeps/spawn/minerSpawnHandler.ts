import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { MinerMemory } from "creeps/action/minerHandler"
import { findCachedStructurePositions } from "utils/structureUtils"

/** A miner this close to dying doesn't count, so its replacement is in place before the source goes idle. */
const MINER_REPLACEMENT_LEAD = 100
/** WORK parts that fully drain a source: it regenerates 3000 per 300 ticks = 10/tick, and each WORK harvests 2. */
const WORK_PER_SOURCE = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER
const MAX_MINERS_PER_SOURCE = 3

/**
 * Goal: Harvest every source at its full 10 energy/tick.
 *
 * Early on the spawn can only afford 3 WORK miners (6/tick), so extra miners are added on other tiles next to the
 * source until it has WORK_PER_SOURCE. Once a full-size miner fits in one body, one miner per source is enough.
 */
export default class MinerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MINER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (!room.memory.buildOrder) return null

    room.memory.minerPositions = this.calcMinerPositions(room)

    const miners = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })
    const healthy = miners.filter(c => c.spawning || MINER_REPLACEMENT_LEAD < (c.ticksToLive ?? 0))

    for (const source of room.find(FIND_SOURCES)) {
      const assigned = healthy.filter(m => (m.memory as MinerMemory).targetSourceId === source.id)
      const work = assigned.reduce((sum, m) => sum + m.getActiveBodyparts(WORK), 0)
      if (WORK_PER_SOURCE <= work || MAX_MINERS_PER_SOURCE <= assigned.length) continue

      const pos = this.freeMiningPosition(room, source, miners)
      if (!pos) continue

      const body = buildCappedBodyParts([WORK], room, WORK_PER_SOURCE - work)
      return new SpawnConfig(body, this.role, {
        memory: {
          targetSourceId: source.id as string,
          targetSourcePos: { x: pos.x, y: pos.y, roomName: room.name }
        } as MinerMemory
      })
    }

    return null
  }

  /**
   * The planned container spot first (energy dropped there lands in the container once it's built), then any other
   * open tile next to the source that no miner, alive or dying, has claimed and nothing is planned to be built on.
   */
  private freeMiningPosition(room: Room, source: Source, miners: Creep[]): RoomPosition | null {
    const claimed = (x: number, y: number) =>
      miners.some(m => {
        const p = (m.memory as MinerMemory).targetSourcePos
        return p && p.x === x && p.y === y
      })

    const container = room.memory.minerPositions.find(p => p.sourceId === source.id)
    if (container && !claimed(container.pos.x, container.pos.y))
      return new RoomPosition(container.pos.x, container.pos.y, room.name)

    const terrain = room.getTerrain()
    const planned = new Set(
      (room.memory.buildOrder || [])
        .filter(s => (OBSTACLE_OBJECT_TYPES as string[]).includes(s.structureType))
        .map(s => `${s.x},${s.y}`)
    )
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = source.pos.x + dx
        const y = source.pos.y + dy
        if ((dx === 0 && dy === 0) || terrain.get(x, y) === TERRAIN_MASK_WALL) continue
        if (planned.has(`${x},${y}`) || claimed(x, y)) continue
        return new RoomPosition(x, y, room.name)
      }
    }
    return null
  }

  private calcMinerPositions(room: Room): { sourceId: string; pos: { x: number; y: number; roomName: string } }[] {
    let minerPositions = []
    const containerPositions = findCachedStructurePositions(room, STRUCTURE_CONTAINER)
    const sources = room.find(FIND_SOURCES)

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]
      for (const containerPos of containerPositions) {
        if (!source.pos.isNearTo(containerPos)) continue

        minerPositions.push({ sourceId: source.id, pos: containerPos })
        break
      }
    }

    return minerPositions
  }
}
