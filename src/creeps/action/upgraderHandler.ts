import PullRequestEvent from "room/pullRequestEvent";
import ICreepHandler from "./ICreepHandler";

export default class UpgraderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const controller: StructureController | undefined = creep.room.controller;

    if (!controller) return;

    const targetPos = this.findTargetRoomPosition(creep, controller);

    if (!targetPos) return;

    if (!creep.pos.isEqualTo(targetPos.x, targetPos.y)) {
      creep.room.memory.events.push(new PullRequestEvent(targetPos, creep.name));
      return;
    }

    if (creep.store.energy === 0) this.collectEnergy(creep);

    creep.upgradeController(controller);
  }

  private collectEnergy(creep: Creep): void {
    const containers = creep.room
      .lookForAt(LOOK_STRUCTURES, creep.pos)
      .filter(s => s.structureType === STRUCTURE_CONTAINER);

    if (containers) {
      creep.withdraw(containers[0], RESOURCE_ENERGY);
      return;
    }

    const energyPiles = creep.room.lookForAt(RESOURCE_ENERGY, creep.pos);

    if (energyPiles) {
      creep.pickup(energyPiles[0]);
    }
  }

  private findTargetRoomPosition(creep: Creep, controller: StructureController): RoomPosition | null {
    const dirs = [
      [-1, 0],
      [-1, -1],
      [0, -1],
      [-1, 1],
      [1, -1],
      [1, 0],
      [0, 1],
      [1, 1]
    ];

    for (const dir of dirs) {
      for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
        const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], creep.room.name);
        if (pos.isNearTo(controller.pos.x, controller.pos.y)) return pos;
      }
    }

    return null;
  }
}
