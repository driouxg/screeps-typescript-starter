import {
  findCachedStructurePositions,
  findContainers,
  findExtensions,
  findStorage,
  findTowers
} from "utils/structureUtils"
import { applyCreepCosts, smartMove } from "./movement"
import { buildStagingPos } from "./buildStaging"

/**
 * Move within `range` of pos. Returns ERR_NO_PATH when the creep is stuck and should pick a new target.
 */
export function moveToWithSinglePath(creep: Creep, pos: RoomPosition, range = 1): CreepReturnCode {
  return smartMove(creep, pos, range)
}

/**
 * Whether pos is reachable, treating friendly creeps that can move as passable (they get shoved out of the way).
 */
function creepCanReachPosition(creep: Creep, pos: RoomPosition): boolean {
  const r = PathFinder.search(
    creep.pos,
    { pos, range: 1 },
    {
      roomCallback(roomName) {
        let costs = new PathFinder.CostMatrix()
        let room = Game.rooms[roomName]
        if (!room) return false

        room.find(FIND_STRUCTURES).forEach(struct => {
          if (struct.structureType === STRUCTURE_ROAD) {
            // Favor roads over plain tiles
            costs.set(struct.pos.x, struct.pos.y, 1)
          } else if (
            struct.structureType !== STRUCTURE_CONTAINER &&
            (struct.structureType !== STRUCTURE_RAMPART || !struct.my)
          ) {
            // Can't walk through non-walkable buildings
            costs.set(struct.pos.x, struct.pos.y, 255)
          }
        })

        return applyCreepCosts(roomName, costs)
      }
    }
  )

  return !r.incomplete
}

export function isWorking(creep: Creep): boolean {
  return creep.memory.working
}

export function hasMaxEnergy(creep: Creep): boolean {
  return creep.store.getFreeCapacity() === 0
}

export function hasEnergy(creep: Creep): boolean {
  return 0 < creep.store.energy
}

export function canStoreEnergy(creep: Creep): boolean {
  return creep.store.getCapacity() !== 0 && creep.store.getCapacity() !== null
}

/**
 * Where to deliver energy, or null when nothing needs it.
 */
export function findOffloadSpot(creep: Creep): RoomPosition | null {
  // offload to extensions
  const extensions = findExtensions(creep.room).filter(e => !isFullOfEnergy(e.store))
  if (0 < extensions.length) {
    extensions.sort(
      (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
    )
    if (creepCanReachPosition(creep, extensions[0].pos)) return extensions[0].pos
  }

  // offload to spawns
  const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => !isFullOfEnergy(s.store))
  if (0 < spawns.length && creepCanReachPosition(creep, spawns[0].pos)) return spawns[0].pos

  // offload to towers
  const towers = findTowers(creep.room).filter(t => !isFullOfEnergy(t.store))
  if (0 < towers.length && creepCanReachPosition(creep, towers[0].pos)) return towers[0].pos

  // drop next to the construction site builders are working on
  const staging = buildStagingPos(creep.room)
  if (staging && creepCanReachPosition(creep, staging)) return staging

  // offload to controller container / position
  const controllerCntPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(c =>
    c.inRangeTo(creep.room.controller!.pos, 2)
  )
  if (
    0 < controllerCntPositions.length &&
    isOffloadableContainerPosition(creep.room, controllerCntPositions) &&
    creepCanReachPosition(creep, controllerCntPositions[0])
  )
    return controllerCntPositions[0]

  // offload to containers positions that are not next to sources until we reach max container amount
  const containerPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(
    c => !isPositionNextToSource(creep, c)
  )

  if (
    0 < containerPositions.length &&
    isOffloadableContainerPosition(creep.room, containerPositions) &&
    creepCanReachPosition(creep, containerPositions[0])
  )
    return containerPositions[0]

  // offload to storage
  const storage = findStorage(creep.room).filter(s => 0 < s.store.getFreeCapacity(RESOURCE_ENERGY))
  if (0 < storage.length && creepCanReachPosition(creep, storage[0].pos)) return storage[0].pos

  return null
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

/**
 * Where to collect energy, or null when there is none worth a trip.
 */
export function findPickupPosition(creep: Creep): RoomPosition | null {
  // energy piles next to sources (every miner drops its own), largest first so haulers spread across sources
  // instead of all draining the first one
  const minAmount = creep.store.getFreeCapacity() / 2
  const energyPiles = ([] as Resource[])
    .concat(
      ...creep.room.find(FIND_SOURCES).map(s =>
        s.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
          filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY && minAmount <= r.amount
        })
      )
    )
    .sort((p1, p2) => p2.amount - p1.amount)

  for (const pile of energyPiles) if (creepCanReachPosition(creep, pile.pos)) return pile.pos

  // containers
  const containers = findContainersNextToSource(creep)
    .filter(c => creep.store.getFreeCapacity() / 2 < c.store[RESOURCE_ENERGY])
    .sort((c1, c2) => c2.store[RESOURCE_ENERGY] - c1.store[RESOURCE_ENERGY])

  if (0 < containers.length && creepCanReachPosition(creep, containers[0].pos)) return containers[0].pos

  // storage
  const storage = findStorage(creep.room).filter(s => 0 < s.store.getUsedCapacity(RESOURCE_ENERGY))
  if (0 < storage.length && creepCanReachPosition(creep, storage[0].pos)) return storage[0].pos

  return null
}

function findContainersNextToSource(creep: Creep): StructureContainer[] {
  const containerPositions = findContainers(creep.room)
  return containerPositions.filter(c => isPositionNextToSource(creep, c.pos))
}
