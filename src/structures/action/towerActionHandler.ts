import { findTowers } from "utils/structureUtils";
import IStructureActionHandler from "./IStructureActionHandler";

export default class TowerActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const towers = findTowers(room);

    if (!this.canOperateTowersInThisRoom(room)) return;

    for (const tower of towers) {
      const enemies: Creep[] = room.find(FIND_HOSTILE_CREEPS);
      if (0 < enemies.length) {
        this.attack(enemies, tower);
        continue;
      }

      const myHealableCreeps: Creep[] = room.find(FIND_MY_CREEPS, { filter: c => c.hits + 100 < c.hitsMax });
      if (0 < myHealableCreeps.length) this.heal(tower, myHealableCreeps);
      else this.repair(tower);
    }
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

  private getMyTowerPositions(room: Room): Position[] {
    return room.memory.positions[STRUCTURE_TOWER];
  }

  private canOperateTowersInThisRoom(room: Room): boolean {
    const myTowerPositions = this.getMyTowerPositions(room);
    return (
      room.controller !== undefined && room.controller.my && 3 <= room.controller.level && 0 < myTowerPositions.length
    );
  }
}
