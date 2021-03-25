export function findTowers(room: Room) {
  let towers: StructureTower[] = [];
  for (let towerPos of Memory.rooms[room.name].myTowerPositions) {
    const structures = room.lookForAt(LOOK_STRUCTURES, towerPos[0], towerPos[1]);
    const tower = structures.find(s => s.structureType === STRUCTURE_TOWER) as StructureTower;

    towers.push(tower);
  }

  return towers;
}
