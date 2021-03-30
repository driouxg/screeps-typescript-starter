import PullRequestEvent from "room/pullRequestEvent";
import { dirs } from "utils/directions";
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
    this.collectEnergy(creep);
    creep.upgradeController(controller);
  }

  private collectEnergy(creep: Creep): void {
    const containerPos = this.findContainerPosition(creep);

    if (!containerPos) return;

    const containers = creep.room
      .lookForAt(LOOK_STRUCTURES, containerPos.x, containerPos.y)
      .filter(s => s.structureType === STRUCTURE_CONTAINER);

    if (0 < containers.length) {
      creep.withdraw(containers[0], RESOURCE_ENERGY);
      return;
    }

    const energyPiles = creep.room.lookForAt(LOOK_ENERGY, containerPos.x, containerPos.y);
    if (energyPiles) creep.pickup(energyPiles[0]);
  }

  private findTargetRoomPosition(creep: Creep, controller: StructureController): RoomPosition | null {
    for (const dir of dirs()) {
      for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
        const pos = new RoomPosition(containerPos.x + dir[0], containerPos.y + dir[1], creep.room.name);
        if (pos.isNearTo(controller.pos.x, controller.pos.y)) return pos;
      }
    }

    return null;
  }

  private findContainerPosition(creep: Creep): RoomPosition | null {
    for (const pos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (creep.pos.isNearTo(pos.x, pos.y)) return pos;
    }

    return null;
  }
}
