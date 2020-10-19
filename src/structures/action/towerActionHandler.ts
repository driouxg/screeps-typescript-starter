import IStructureActionHandler from "./IStructureActionHandler";

export default class TowerActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const myTowerPositions: number[][] = this.getMyTowerPositions(room);

    if (!this.canOperateTowersInThisRoom(room)) return;

    for (const pos of myTowerPositions) {
      const tower: StructureTower = this.getTowerAtPos(room, pos);
      if (!tower) continue;

      const enemies: Creep[] = room.find(FIND_HOSTILE_CREEPS);
      if (0 < enemies.length) {
        this.attack(enemies, tower);
        continue;
      }

      const myHealableCreeps: Creep[] = room.find(FIND_MY_CREEPS, { filter: c => c.hits + 100 < c.hitsMax });
      if (0 < myHealableCreeps.length) this.heal(tower, myHealableCreeps);
      else this.repair(tower);
    }

    this.cacheMyTowerPositions(room, myTowerPositions);
  }

  private attack(enemies: Creep[], tower: StructureTower): void {
    const healerEnemies: Creep[] = enemies.filter(c => 0 < c.getActiveBodyparts(HEAL));

    if (0 < healerEnemies.length) tower.attack(healerEnemies[0]);
    else {
      console.log(tower.attack(enemies[0]));
    }
  }

  private repair(tower: StructureTower) {
    const structures: AnyOwnedStructure[] = tower.room.find(FIND_MY_STRUCTURES, { filter: s => s.hits < s.hitsMax });
    tower.repair(structures[0]);
  }

  private heal(tower: StructureTower, myHealableCreeps: Creep[]): void {
    tower.heal(myHealableCreeps[0]);
  }

  private getTowerAtPos(room: Room, pos: number[]): StructureTower {
    const towers: Structure<StructureConstant>[] = room.lookForAt(LOOK_STRUCTURES, pos[0], pos[1]);
    return towers.find(s => s.structureType === STRUCTURE_TOWER) as StructureTower;
  }

  private getMyTowerPositions(room: Room): number[][] {
    return room.memory.myTowerPositions || this.calcTowerPositions(room);
  }

  private calcTowerPositions(room: Room): number[][] {
    const positions: number[][] = [];
    const desiredState: string[][] = room.memory.desiredState;
    for (let y = 0; y < desiredState.length; y++) {
      for (let x = 0; x < desiredState[y].length; x++) {
        if (desiredState[y][x] === STRUCTURE_TOWER) positions.push([x, y]);
      }
    }

    return positions;
  }

  private cacheMyTowerPositions(room: Room, myTowerPositions: number[][]) {
    room.memory.myTowerPositions = myTowerPositions;
  }

  private canOperateTowersInThisRoom(room: Room): boolean {
    const myTowerPositions = this.getMyTowerPositions(room);
    return (
      room.controller !== undefined && room.controller.my && 3 <= room.controller.level && 0 < myTowerPositions.length
    );
  }
}
