import {
  findCachedStructurePositions,
  findContainers,
  findExtensions,
  findStorage,
  findTowers
} from "utils/structureUtils"
import { applyCreepCosts, smartMove } from "./movement"
import { buildStagingPos } from "./buildStaging"
import { rapidFillOf } from "structures/rapidFill"
import { RAPID_FILLER } from "creeps/roles"
import * as creepRoles from "creeps/roles"
import { TOWER_MIN_STOCK } from "structures/action/towerActionHandler"
import { isUnderAttack } from "defence/threat"

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
 * Tiles other haulers in the creep's room are delivering to right now (home haulers' offloadTargetPos while working,
 * remote haulers' offload while delivering), so each picks its own extension.
 */
function extensionsClaimed(creep: Creep): Set<number> {
  const claimed = new Set<number>()
  for (const other of creep.room.find(FIND_MY_CREEPS)) {
    if (other.id === creep.id) continue
    const memory = other.memory as {
      working?: boolean
      state?: string
      offloadTargetPos?: RoomPositionJson
      offload?: RoomPositionJson
    }
    const target =
      other.memory.role === creepRoles.HAULER && memory.working
        ? memory.offloadTargetPos
        : other.memory.role === creepRoles.REMOTE_HAULER && memory.state === "deliver"
        ? memory.offload
        : undefined
    if (target?.roomName === creep.room.name) claimed.add(target.x * 50 + target.y)
  }
  return claimed
}

/**
 * Where to deliver energy, or null when nothing needs it.
 */
export function findOffloadSpot(creep: Creep): RoomPosition | null {
  // Spawns and extensions a rapid filler covers are its job; bring energy to the rapid fill's containers instead.
  const covered = coveredByFillers(creep.room)

  // Towers first while they're below their minimum stock, or not full while we're under attack: a tower that can't
  // fire (or repair) is worth less than a few more creep parts. Emptiest first.
  const towerFloor = isUnderAttack(creep.room) ? undefined : TOWER_MIN_STOCK
  const lowTowers = findTowers(creep.room)
    .filter(t => t.store.energy < (towerFloor ?? t.store.getCapacity(RESOURCE_ENERGY)))
    .sort((a, b) => a.store.energy - b.store.energy)
  if (0 < lowTowers.length && creepCanReachPosition(creep, lowTowers[0].pos)) return lowTowers[0].pos

  // offload to extensions: the nearest one no other hauler is already on its way to fill (one is plenty for an
  // extension; all going to the same one wasted their trips)
  const claimed = extensionsClaimed(creep)
  const extensions = findExtensions(creep.room).filter(
    e => !isFullOfEnergy(e.store) && !covered(e.pos) && !claimed.has(e.pos.x * 50 + e.pos.y)
  )
  if (0 < extensions.length) {
    extensions.sort(
      (e1, e2) => e1.pos.getRangeTo(creep.pos.x, creep.pos.y) - e2.pos.getRangeTo(creep.pos.x, creep.pos.y)
    )
    if (creepCanReachPosition(creep, extensions[0].pos)) return extensions[0].pos
  }

  // offload to spawns
  const spawns = creep.room.find(FIND_MY_SPAWNS).filter(s => !isFullOfEnergy(s.store) && !covered(s.pos))
  if (0 < spawns.length && creepCanReachPosition(creep, spawns[0].pos)) return spawns[0].pos

  // Towers below half: they defend the room and keep its ramparts from decaying, so they come next.
  const hungryTowers = findTowers(creep.room)
    .filter(t => t.store.energy < t.store.getCapacity(RESOURCE_ENERGY) / 2)
    .sort((a, b) => a.store.energy - b.store.energy)
  if (0 < hungryTowers.length && creepCanReachPosition(creep, hungryTowers[0].pos)) return hungryTowers[0].pos

  // The rapid fill's containers (while fillers are there to use them) and the controller container each get a minimum
  // first, so neither spawning nor upgrading stalls; then towers; then the rapid fill up to its working buffer.
  const rapidFillContainers = rapidFillContainersBelow(creep.room)
  const controllerCntPositions = findCachedStructurePositions(creep.room, STRUCTURE_CONTAINER).filter(c =>
    c.inRangeTo(creep.room.controller!.pos, 2)
  )

  const urgentRapidFill = rapidFillContainers(RAPID_FILL_MIN_STOCK)
  if (urgentRapidFill && creepCanReachPosition(creep, urgentRapidFill.pos)) return urgentRapidFill.pos

  if (
    0 < controllerCntPositions.length &&
    energyAt(creep.room, controllerCntPositions[0]) < CONTROLLER_MIN_STOCK &&
    creepCanReachPosition(creep, controllerCntPositions[0])
  )
    return controllerCntPositions[0]

  // offload to towers
  const towers = findTowers(creep.room).filter(t => !isFullOfEnergy(t.store))
  if (0 < towers.length && creepCanReachPosition(creep, towers[0].pos)) return towers[0].pos

  const rapidFill = rapidFillContainers(rapidFillBuffer(creep.room))
  if (rapidFill && creepCanReachPosition(creep, rapidFill.pos)) return rapidFill.pos

  // drop next to the construction site builders are working on
  const staging = buildStagingPos(creep.room)
  if (staging && creepCanReachPosition(creep, staging)) return staging

  // offload to controller container / position
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
  // Only the container: a road or rampart on the same tile has no store.
  const containers = room
    .lookForAt(LOOK_STRUCTURES, pos)
    .filter(s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer[]
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

/**
 * Energy to keep in each rapid fill container: half of what the stamp's spawns and extensions hold, i.e. one full
 * refill between the two containers. More would just sit there instead of being upgraded or built with.
 */
function rapidFillBuffer(room: Room): number {
  const rapidFill = rapidFillOf(room)
  if (!rapidFill) return 0
  const capacity = rapidFill.center
    .findInRange(FIND_MY_STRUCTURES, 2, {
      filter: s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION
    })
    .reduce((sum, s) => sum + (s as StructureSpawn | StructureExtension).store.getCapacity(RESOURCE_ENERGY), 0)
  return Math.max(RAPID_FILL_MIN_STOCK, capacity / 2)
}

function fillersInPlace(room: Room): Creep[] {
  return room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === RAPID_FILLER && c.memory.stationary === true })
}

function hasFillers(room: Room): boolean {
  return 0 < fillersInPlace(room).length
}

/** Whether a rapid filler standing on its spot is next to `pos` (and so keeps whatever is there full). */
function coveredByFillers(room: Room): (pos: RoomPosition) => boolean {
  const fillers = fillersInPlace(room)
  return pos => fillers.some(f => f.pos.isNearTo(pos))
}

/** Keep at least this much energy at the controller container for upgraders, even while building. */
const CONTROLLER_MIN_STOCK = 300

/** Energy on the ground and in a container at `pos`. */
function energyAt(room: Room, pos: RoomPosition): number {
  const container = room.lookForAt(LOOK_STRUCTURES, pos).find(s => s.structureType === STRUCTURE_CONTAINER) as
    | StructureContainer
    | undefined
  const piles = room.lookForAt(LOOK_ENERGY, pos).reduce((sum, r) => sum + r.amount, 0)
  return piles + (container ? container.store.energy : 0)
}

/** Below this the rapid fill risks running dry, and the spawn with it. */
const RAPID_FILL_MIN_STOCK = 300

/**
 * The emptiest rapid fill container holding less than a given amount, or null; only while fillers are in place to
 * use them.
 */
function rapidFillContainersBelow(room: Room): (amount: number) => StructureContainer | null {
  const rapidFill = rapidFillOf(room)
  const containers =
    rapidFill && hasFillers(room)
      ? rapidFill.containers
          .map(p => p.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer)
          .filter(Boolean)
      : []
  return amount =>
    containers.filter(c => c.store.energy < amount).sort((a, b) => a.store.energy - b.store.energy)[0] ?? null
}
