import ICreepHandler from "./ICreepHandler";
import * as creepRoles from "../roles";
import PullRequestEvent from "room/pullRequestEvent";

export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const nearbyMineableSource = this.retrieveNearbyMineableSource(creep);
    if (nearbyMineableSource) {
      creep.harvest(nearbyMineableSource);
      return;
    }

    this.sendPullRequestRoomEvent(creep);
  }

  private retrieveNearbyMineableSource(creep: Creep): Source | null {
    const sources = creep.room.find(FIND_SOURCES);

    for (const source of sources) {
      if (creep.pos.isNearTo(source.pos)) return source;
    }

    return null;
  }

  private sendPullRequestRoomEvent(creep: Creep): void {
    const targetPos = this.findAvailableMinerPosition(creep);
    if (!targetPos) return;

    creep.room.memory.events.push(new PullRequestEvent(targetPos, creep.name));
  }

  private findAvailableMinerPosition(creep: Creep): RoomPosition | null {
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      const sources = creep.room.find(FIND_SOURCES);

      for (const source of sources) {
        if (!source.pos.isNearTo(containerPos.x, containerPos.y)) continue;

        if (this.sourceAlreadyHasMiner(creep.room, containerPos)) continue;

        return new RoomPosition(containerPos.x, containerPos.y, creep.room.name);
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
