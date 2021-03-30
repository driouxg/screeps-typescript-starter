export function findTowers(room: Room): StructureTower[] {
  if (!room.memory.positions[STRUCTURE_TOWER]) return [];
  let towers: StructureTower[] = [];

  for (let pos of room.memory.positions[STRUCTURE_TOWER]) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const tower = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureTower;

    if (tower) towers.push(tower);
  }

  return towers;
}

export function findContainers(room: Room): StructureContainer[] {
  let containers: StructureContainer[] = [];
  for (let pos of findCachedStructurePositions(room, STRUCTURE_CONTAINER)) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const container = structures.find(s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

    if (container) containers.push(container);
  }

  return containers;
}

export function findSpawns(room: Room): StructureSpawn[] {
  let spawns = [];
  for (let pos of findCachedStructurePositions(room, STRUCTURE_SPAWN)) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const spawn = structures.find(s => s.structureType === STRUCTURE_SPAWN) as StructureSpawn;

    if (spawn) spawns.push(spawn);
  }

  return spawns;
}

export function findExtensions(room: Room): StructureExtension[] {
  let extensions = [];
  for (let pos of findCachedStructurePositions(room, STRUCTURE_EXTENSION)) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const extension = structures.find(s => s.structureType === STRUCTURE_EXTENSION) as StructureExtension;

    if (extension) extensions.push(extension);
  }

  return extensions;
}

export function findCachedStructurePositions(room: Room, structureType: StructureConstant): RoomPosition[] {
  if (!room.memory.positions || !room.memory.positions[structureType]) return [];

  let positions = [];
  for (let pos of room.memory.positions[structureType]) positions.push(pos);

  return positions;
}

export function findStorage(room: Room): StructureStorage[] {
  if (!room.memory.positions[STRUCTURE_STORAGE]) return [];

  let storages = [];
  for (let pos of room.memory.positions[STRUCTURE_STORAGE]) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const storage = structures.find(s => s.structureType === STRUCTURE_STORAGE) as StructureStorage;

    if (storage) storages.push(storage);
  }

  return storages;
}
