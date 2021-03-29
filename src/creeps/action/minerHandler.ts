import ICreepHandler from "./ICreepHandler";
import * as creepRoles from "../roles";
import PullRequestEvent from "room/pullRequestEvent";
import NearbySourceEnergyHarvester from "./common/nearbySourceEnergyHarvester";
import { findContainers } from "utils/structureUtils";

export default class MinerHandler implements ICreepHandler {
  private nearbySourceEnergyHarvester: NearbySourceEnergyHarvester;

  public constructor() {
    this.nearbySourceEnergyHarvester = new NearbySourceEnergyHarvester();
  }

  handle(creep: Creep): void {
    if (this.nearbySourceEnergyHarvester.retrieve(creep) === ERR_NOT_IN_RANGE) this.sendPullRequestRoomEvent(creep);
  }

  private sendPullRequestRoomEvent(creep: Creep): void {
    const targetPos = this.findAvailableMinerPosition(creep);
    if (!targetPos) return;

    creep.room.memory.events.push(new PullRequestEvent(targetPos, creep.name));
  }

  private findAvailableMinerPosition(creep: Creep): RoomPosition | null {
    for (const container of findContainers(creep.room)) {
      const sources = creep.room.find(FIND_SOURCES);

      for (const source of sources) {
        if (!source.pos.isNearTo(container.pos.x, container.pos.y)) continue;

        if (this.sourceAlreadyHasMiner(creep.room, container.pos)) continue;

        return new RoomPosition(container.pos.x, container.pos.y, creep.room.name);
      }
    }

    return null;
  }

  private sourceAlreadyHasMiner(room: Room, containerPos: RoomPosition): boolean {
    const creeps = room.lookForAt(LOOK_CREEPS, containerPos.x, containerPos.y).filter(c => c.my);

    for (const creep of creeps) {
      if (creep.memory.role === creepRoles.MINER) return true;
    }
    return false;
  }
}
