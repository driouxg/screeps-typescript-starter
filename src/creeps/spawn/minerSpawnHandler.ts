import { sourceLinkOf } from "structures/links"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import * as creepRoles from "../roles"
import { buildCappedBodyParts } from "./utils/dynamicBodyParts"
import { MinerMemory } from "creeps/action/minerHandler"
import { findCachedStructurePositions } from "utils/structureUtils"
import { containerSpot, freeMiningPosition, minerAt } from "creeps/action/common/miningPosition"

/** A miner this close to dying doesn't count, so its replacement is in place before the source goes idle. */
const MINER_REPLACEMENT_LEAD = 100
/** WORK parts that fully drain a source: it regenerates 3000 per 300 ticks = 10/tick, and each WORK harvests 2. */
const WORK_PER_SOURCE = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME / HARVEST_POWER
const MAX_MINERS_PER_SOURCE = 3

function workBody(work: number): BodyPartConstant[] {
  return Array<BodyPartConstant>(Math.max(1, work)).fill(WORK)
}

function tileOf(miner: Creep): RoomPosition {
  const p = (miner.memory as MinerMemory).targetSourcePos
  return p ? new RoomPosition(p.x, p.y, p.roomName) : miner.pos
}

/**
 * Goal: Harvest every source at its full 10 energy/tick with as few, as large miners as the room can afford.
 *
 * - A source nobody is mining gets a miner right away, sized to the energy available now.
 * - Otherwise miners are sized to the room's energy capacity, and we save up for them rather than spawn a small one
 *   that would under-mine the source for its whole 1500 ticks.
 * - Early on the spawn can only afford 3 WORK miners (6/tick), so extra miners go on other free tiles next to the
 *   source until it has WORK_PER_SOURCE.
 * - A source with no free tile left but too little WORK gets its weakest miner replaced by a larger one once the room
 *   can afford it; the old miner retires when its replacement has spawned (see MinerHandler).
 * - A dying miner's replacement takes over its tile.
 * - Once a full-size miner is affordable it always goes on the container spot (see below).
 */
export default class MinerSpawnHandler implements ISpawnHandler {
  private role: string = creepRoles.MINER

  spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const { room } = spawn
    if (!room.memory.buildOrder) return null

    room.memory.minerPositions = this.calcMinerPositions(room)

    const miners = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === this.role })
    const healthy = miners.filter(c => c.spawning || MINER_REPLACEMENT_LEAD < (c.ticksToLive ?? 0))
    const affordableWork = Math.min(WORK_PER_SOURCE, Math.floor(room.energyCapacityAvailable / BODYPART_COST[WORK]))
    const workOf = (c: Creep) => c.getActiveBodyparts(WORK)

    for (const source of room.find(FIND_SOURCES)) {
      const onSource = (m: Creep) => (m.memory as MinerMemory).targetSourceId === source.id
      const assigned = healthy.filter(onSource)
      const work = assigned.reduce((sum, m) => sum + workOf(m), 0)
      if (WORK_PER_SOURCE <= work) continue
      // Hard cap, dying miners and replacements included, whatever else goes wrong.
      if (MAX_MINERS_PER_SOURCE + 1 <= miners.filter(onSource).length) continue
      // Don't queue another miner while one is still on its way: pulling is one at a time, so it would just wait.
      if (assigned.some(m => m.spawning || !m.pos.isNearTo(source))) continue

      // Nobody mining at all: take what we can get now. The room's very first miner gets a MOVE part and walks: a
      // puller would cost the spawn another 150 energy (150 ticks of regeneration) before any energy flows.
      if (!miners.some(onSource)) {
        const pos = freeMiningPosition(room, source, miners)
        const walker = miners.length === 0 ? [MOVE] : undefined
        if (pos) return this.config(buildCappedBodyParts([WORK], room, WORK_PER_SOURCE + 1, walker), source, pos)
        continue
      }

      // Once a full-size miner is affordable, it goes on the container spot, taking over from whichever miner holds
      // it (the handover is in MinerHandler); smaller miners elsewhere at the source then retire.
      const replaced = (m: Creep) => miners.some(r => (r.memory as MinerMemory).replaces === m.name)
      const spot = containerSpot(room, source)
      if (affordableWork === WORK_PER_SOURCE && spot) {
        const holder = minerAt(spot, miners.filter(onSource))
        if (holder && replaced(holder)) continue
        // With a link by its source, a CARRY part too: the miner puts what it harvests in the link (see MinerHandler).
        const carry = sourceLinkOf(room, source) && WORK_PER_SOURCE * BODYPART_COST[WORK] + BODYPART_COST[CARRY] <= room.energyCapacityAvailable
        return this.config([...workBody(WORK_PER_SOURCE), ...(carry ? [CARRY] : [])], source, spot, true, holder?.name)
      }

      const pos = freeMiningPosition(room, source, miners)
      if (pos && assigned.length < MAX_MINERS_PER_SOURCE)
        return this.config(workBody(Math.min(WORK_PER_SOURCE - work, affordableWork)), source, pos, true)
      if (pos) continue

      // No free tile. Replace a dying miner on its tile, or upgrade the weakest one as soon as a larger one is
      // affordable: each WORK part more harvests 2 energy/tick, about 3000 over a miner's life, far more than the
      // few idle ticks of a swap or the old miner's remaining life cost. Either way the replacement takes over at the
      // tile (MinerHandler).
      const dying = miners.find(m => onSource(m) && !healthy.includes(m) && !replaced(m))
      // Only what the source is missing: other healthy miners already cover `work`.
      if (dying)
        return this.config(
          workBody(Math.min(affordableWork, WORK_PER_SOURCE - work)),
          source,
          tileOf(dying),
          true,
          dying.name
        )

      const weakest = assigned.filter(m => !m.spawning).sort((a, b) => workOf(a) - workOf(b))[0]
      if (weakest && !replaced(weakest) && workOf(weakest) < affordableWork)
        return this.config(workBody(affordableWork), source, tileOf(weakest), true, weakest.name)
    }

    return null
  }

  private config(body: BodyPartConstant[], source: Source, pos: RoomPosition, wait = false, replaces?: string) {
    return new SpawnConfig(body, this.role, {
      memory: {
        targetSourceId: source.id as string,
        targetSourcePos: { x: pos.x, y: pos.y, roomName: pos.roomName },
        ...(replaces ? { replaces } : {})
      } as MinerMemory,
      waitForEnergy: wait
    })
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
