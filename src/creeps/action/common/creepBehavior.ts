import { dirs } from "utils/directions"
import {
  findCachedStructurePositions,
  findContainers,
  findExtensions,
  findStorage,
  findTowers
} from "utils/structureUtils"

export function moveToWithSinglePath(creep: Creep, pos: RoomPosition): CreepReturnCode {
  // eslint-disable-next-line id-blacklist
  const code = creep.moveTo(pos, { reusePath: 0, ignoreCreeps: false })

  if (code === ERR_NO_PATH) {
    const dir = dirs().sort(() => Math.random() - 0.5)
    return creep.moveTo(pos.x + dir[0][0], pos.y + dir[0][1])
  }
  return code
}

export function isWorking(creep: Creep): boolean {
  return creep.memory.working
}

export function hasMaxEnergy(creep: Creep): boolean {
  return creep.store.getFreeCapacity() === 0
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
  const extensions = findExtensions(creep.room).filter(e => !isFullOfEnergy(e.store))
  if (0 < extensions.length) {
    extensions.sort(
      (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
    )
    return extensions[0].pos
  }

  // offload to spawns
  const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => !isFullOfEnergy(s.store))
  if (0 < spawns.length) {
    return spawns[0].pos
  }

  // offload to towers
  const towers = findTowers(creep.room).filter(t => !isFullOfEnergy(t.store))
  if (0 < towers.length) {
    return towers[0].pos
  }

  // offload to controller container / position
  const controllerCntPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(c =>
    c.inRangeTo(creep.room.controller!.pos, 2)
  )
  if (0 < controllerCntPositions.length && isOffloadableContainerPosition(creep.room, controllerCntPositions)) {
    return controllerCntPositions[0]
  }

  // offload to containers positions that are not next to sources until we reach max container amount
  const containerPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(
    c => !isPositionNextToSource(creep, c)
  )

  if (0 < containerPositions.length && isOffloadableContainerPosition(creep.room, containerPositions)) {
    return containerPositions[0]
  }

  // offload to storage
  const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < storage.length) {
    return storage[0].pos
  }

  return creep.pos
}

function isOffloadableContainerPosition(room: Room, containerPos: RoomPosition[]) {
  const pos = new RoomPosition(containerPos[0].x, containerPos[0].y, room.name)
  const containers = room.lookForAt(LOOK_STRUCTURES, pos) as StructureContainer[]
  const energyPiles = room.lookForAt(LOOK_ENERGY, pos)

  return (
    (0 < containers.length && containers[0].store.energy < containers[0].store.getCapacity(RESOURCE_ENERGY) * 0.5) ||
    energyPiles.length <= 0 ||
    energyPiles[0].amount < 1000
  )
}

export function isPositionNextToSource(creep: Creep, pos: RoomPosition): boolean {
  const sources = creep.room.find(FIND_SOURCES)

  for (const source of sources) {
    if (source.pos.isNearTo(pos.x, pos.y)) return true
  }
  return false
}

function isFullOfEnergy(store: Store<"energy", false>) {
  return store.getFreeCapacity(RESOURCE_ENERGY) <= 0
}

export function findPickupPosition(creep: Creep): RoomPosition {
  // energy piles
  const energyPiles = findContainerPositionsNextToSource(creep)
    .map(p => creep.room.lookForAt(RESOURCE_ENERGY, p.x, p.y))
    .filter(e => filterPositionsThatHaveEnoughEnergyOnGround(creep, e))

  if (0 < energyPiles.length) {
    return energyPiles[0][0].pos
  }

  // containers
  const containers = findContainersNextToSource(creep)
    .filter(c => creep.store.getFreeCapacity() / 2 < c.store[RESOURCE_ENERGY])
    .sort((c1, c2) => c2.store[RESOURCE_ENERGY] - c1.store[RESOURCE_ENERGY])

  if (0 < containers.length) return containers[0].pos

  // storage
  const storage = findStorage(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY))
  if (0 < storage.length) return storage[0].pos

  return creep.pos
}

function filterPositionsThatHaveEnoughEnergyOnGround(creep: Creep, energyPiles: Resource[]): boolean {
  return energyPiles && energyPiles.length === 1 && creep.store.getFreeCapacity() / 2 <= energyPiles[0].amount
}

function findContainersNextToSource(creep: Creep): StructureContainer[] {
  const containerPositions = findContainers(creep.room)
  return containerPositions.filter(c => isPositionNextToSource(creep, c.pos))
}

function findContainerPositionsNextToSource(creep: Creep): RoomPosition[] {
  const poss = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER)
  return poss.filter(p => isPositionNextToSource(creep, p))
}
