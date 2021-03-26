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
  if (!room.memory.positions[STRUCTURE_CONTAINER]) return [];

  let containers: StructureContainer[] = [];
  for (let pos of Memory.rooms[room.name].positions[STRUCTURE_CONTAINER]) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const container = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureContainer;

    if (container) containers.push(container);
  }

  return containers;
}

export function findSpawns(room: Room): StructureSpawn[] {
  if (!room.memory.positions[STRUCTURE_SPAWN]) return [];

  let spawns = [];
  for (let pos of Memory.rooms[room.name].positions[STRUCTURE_SPAWN]) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const spawn = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureSpawn;

    if (spawn) spawns.push(spawn);
  }

  return spawns;
}

export function extensions(room: Room): StructureExtension[] {
  if (!room.memory.positions[STRUCTURE_EXTENSION]) return [];

  let extensions = [];
  for (let pos of Memory.rooms[room.name].positions[STRUCTURE_EXTENSION]) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
    const extension = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureExtension;

    if (extension) extensions.push(extension);
  }

  return extensions;
}
