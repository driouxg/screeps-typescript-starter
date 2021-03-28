import ICreepHandler from "./ICreepHandler";
import * as creepRoles from "../roles";
import PullRequestEvent from "room/pullRequestEvent";

export default class MinerHandler implements ICreepHandler {
  handle(creep: Creep): void {
    const sources = creep.room.find(FIND_SOURCES);
    let isNextToSource = false;
    let mineableSource = null;

    for (const source of sources) {
      if (creep.pos.isNearTo(source.pos)) {
        isNextToSource = true;
        mineableSource = source;
        break;
      }
    }

    if (isNextToSource) {
      creep.harvest(mineableSource as Source);
      return;
    }

    this.sendPullRequestRoomEvent(creep);
  }

  private sendPullRequestRoomEvent(creep: Creep): void {
    const minerPos = this.findAvailableMinerPosition(creep);
    if (!minerPos) return;

    creep.room.memory.events.push(new PullRequestEvent(minerPos, creep.name));
  }

  private findAvailableMinerPosition(creep: Creep): RoomPosition | null {
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      const sources = creep.room.find(FIND_SOURCES);

      for (const source of sources) {
        if (!source.pos.isNearTo(containerPos.x, containerPos.y)) continue;

        const creeps = creep.room.lookForAt(LOOK_CREEPS, containerPos.x, containerPos.y).filter(c => c.my);

        if (creeps.length === 1 && creeps[0].memory.role === creepRoles.MINER) continue;

        return new RoomPosition(containerPos.x, containerPos.y, creep.room.name);
      }
    }

    return null;
  }
}
