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
