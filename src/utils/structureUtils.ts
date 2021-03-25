export function findTowers(room: Room): StructureTower[] {
  let towers: StructureTower[] = [];
  for (let pos of Memory.rooms[room.name].myTowerPositions) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1]);
    const tower = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureTower;

    towers.push(tower);
  }

  return towers;
}

export function findContainers(room: Room): StructureContainer[] {
  let containers: StructureContainer[] = [];
  for (let pos of Memory.rooms[room.name].myContainerPositions) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1]);
    const container = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureContainer;

    containers.push(container);
  }

  return containers;
}

export function findSpawns(room: Room): StructureSpawn[] {
  let spawns = [];
  for (let pos of Memory.rooms[room.name].mySpawnPositions) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1]);
    const spawn = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureSpawn;

    spawns.push(spawn);
  }

  return spawns;
}

export function extensions(room: Room): StructureExtension[] {
  let extensions = [];
  for (let pos of Memory.rooms[room.name].myExtensionPositions) {
    const structures = room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1]);
    const extension = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureExtension;

    extensions.push(extension);
  }

  return extensions;
}
