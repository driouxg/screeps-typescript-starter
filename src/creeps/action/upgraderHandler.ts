import PullRequestEvent from "room/pullRequestEvent";
import ICreepHandler from "./ICreepHandler";

export default class UpgraderHandler implements ICreepHandler {
  public handle(creep: Creep): void {
    const controller: StructureController | undefined = creep.room.controller;

    if (!controller) return;

    if (!creep.pos.isNearTo(controller.pos)) {
      const controllerContainer = this.findControllerContainerPosition(creep, controller);
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

  private findControllerContainerPosition(creep: Creep, controller: StructureController): RoomPosition | null {
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (controller.pos.isNearTo(containerPos.x, containerPos.y))
        return new RoomPosition(containerPos.x, containerPos.y, creep.room.name);
    }

    return null;
  }
}
