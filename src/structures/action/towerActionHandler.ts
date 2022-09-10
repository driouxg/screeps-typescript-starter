import { isEdge } from "utils/gridBuilder"
import { jsonToRoomPosition } from "utils/jsonMapper"
import { findTowers } from "utils/structureUtils"
import IStructureActionHandler from "./IStructureActionHandler"

export default class TowerActionHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    if (!this.canOperateTowersInThisRoom(room)) return

    for (const tower of findTowers(room)) {
      const enemies: Creep[] = room.find(FIND_HOSTILE_CREEPS, { filter: c => !isEdge(c.pos.x, c.pos.y) })
      if (0 < enemies.length) {
        this.attack(enemies, tower)
        continue
      }

      const myHealableCreeps: Creep[] = room.find(FIND_MY_CREEPS, { filter: c => c.hits + 100 < c.hitsMax })
      if (0 < myHealableCreeps.length) {
        this.heal(tower, myHealableCreeps)
        continue
      }

      if (Game.time % 2 !== 0) return // Towers are using all energy on repairs

      // Repair ramparts
      const ramparts = room
        .find(FIND_MY_STRUCTURES, { filter: c => c.structureType === STRUCTURE_RAMPART && c.hits !== c.hitsMax })
        .sort((a, b) => a.hits - b.hits)

      if (0 < ramparts.length) tower.repair(ramparts[0])
    }
  }

  private attack(enemies: Creep[], tower: StructureTower): void {
    const healerEnemies: Creep[] = enemies.filter(c => 0 < c.getActiveBodyparts(HEAL))

    if (0 < healerEnemies.length) tower.attack(healerEnemies[0])
    else tower.attack(enemies[0])
  }

  private heal(tower: StructureTower, myHealableCreeps: Creep[]): void {
    tower.heal(myHealableCreeps[0])
  }

  private getMyTowerPositions(room: Room): RoomPosition[] {
    if (!room.memory.positions || !room.memory.positions[STRUCTURE_TOWER]) return []
    return room.memory.positions[STRUCTURE_TOWER].map(p => jsonToRoomPosition(p))
  }

  private canOperateTowersInThisRoom(room: Room): boolean {
    const myTowerPositions = this.getMyTowerPositions(room)

    if (!myTowerPositions) return false

    return (
      room.controller !== undefined &&
      room.controller.my &&
      3 <= room.controller.level &&
      myTowerPositions &&
      0 < myTowerPositions.length
    )
  }

  private dist(pos1: RoomPosition, pos2: RoomPosition): number {
    return Math.sqrt(Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2))
  }
}
