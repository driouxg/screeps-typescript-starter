import {
  findCachedStructurePositions,
  findContainers,
  findExtensions,
  findStorage,
  findTowers
} from "utils/structureUtils"
import ICreepEnergyRetrieval from "./ICreepEnergyRetrieval"

export function moveToWithSinglePath(creep: Creep, pos: RoomPosition): CreepReturnCode {
  // eslint-disable-next-line id-blacklist
  return creep.moveTo(pos, { reusePath: 50 })
}

export function isWorking(creep: Creep): boolean {
  return creep.memory.working
}

export function hasMaxEnergy(creep: Creep): boolean {
  return creep.store.getFreeCapacity() === 0
}

export function harvestUntilMaxEnergy(creep: Creep, creepEnergyRetrieval: ICreepEnergyRetrieval) {
  creepEnergyRetrieval.retrieve(creep)
  if (hasMaxEnergy(creep)) creep.memory.working = true
}

export function updateWorkingState(creep: Creep): void {
  if (!hasEnergy(creep)) {
    creep.memory.working = false
  }

  if (hasMaxEnergy(creep) || !canStoreEnergy(creep)) {
    creep.memory.working = true
  }
}

export function hasEnergy(creep: Creep): boolean {
  return 0 < creep.store.energy
}

export function canStoreEnergy(creep: Creep): boolean {
  return creep.store.getCapacity() !== 0 && creep.store.getCapacity() !== null
}

export function findOffloadSpot(creep: Creep): RoomPosition {
  // offload to extensions
  const extensions = findExtensions(creep.room).filter(e => 0 < e.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < extensions.length) {
    extensions.sort(
      (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
    )
    return extensions[0].pos
  }

  // offload to spawns
  const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < spawns.length) {
    return spawns[0].pos
  }

  // offload to towers
  const towers = findTowers(creep.room).filter(t => 0 < t.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < towers.length) {
    return towers[0].pos
  }

  // offload to controller container
  const containers = findContainers(creep.room).filter(c => c.pos.inRangeTo(creep.room.controller!.pos, 2))
  if (0 < containers.length && containers[0].store.energy <= 1500) return containers[0].pos

  // offload to containers positions that are not next to sources until we reach max container amount
  const containerPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(
    c => !isPositionNextToSource(creep, c)
  )

  if (0 < containerPositions.length) {
    const pos = new RoomPosition(containerPositions[0].x, containerPositions[0].y, creep.room.name)
    const containers = creep.room.lookForAt(LOOK_STRUCTURES, pos) as StructureContainer[]
    const energyPiles = creep.room.lookForAt(LOOK_ENERGY, pos)

    if (
      (0 < containers.length && containers[0].store.energy < containers[0].store.getCapacity(RESOURCE_ENERGY)) ||
      energyPiles.length <= 0 ||
      energyPiles[0].amount < 2000
    ) {
      return containerPositions[0]
    }
  }

  // offload to storage
  const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < storage.length) {
    return storage[0].pos
  }

  return creep.pos
}

export function isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
  const sources = creep.room.find(FIND_SOURCES)

  for (const source of sources) {
    if (source.pos.isNearTo(pos.x, pos.y)) return true
  }
  return false
}
