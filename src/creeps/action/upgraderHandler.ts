import PullRequestEvent from "room/pullRequestEvent";
import ICreepHandler from "./ICreepHandler";

export default class UpgraderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const controller: StructureController | undefined = creep.room.controller;

    if (!controller) return;

    const controllerContainerPosition = this.findControllerContainerPosition(creep, controller);

    if (!controllerContainerPosition) return;

    if (!creep.pos.isEqualTo(controllerContainerPosition.x, controllerContainerPosition.y)) {
      const controllerContainer = this.findControllerContainerRoomPosition(creep, controller);
      if (controllerContainer) creep.room.memory.events.push(new PullRequestEvent(controllerContainer, creep.name));
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

  private findControllerContainerRoomPosition(creep: Creep, controller: StructureController): RoomPosition | null {
    const pos = this.findControllerContainerPosition(creep, controller);
    return pos ? new RoomPosition(pos?.x, pos?.y, creep.room.name) : null;
  }

  private findControllerContainerPosition(creep: Creep, controller: StructureController): Position | null {
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (controller.pos.isNearTo(containerPos.x, containerPos.y)) return containerPos;
    }

    return null;
  }
}
