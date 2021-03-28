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

    const pullingCreep = this.findNearbyPullerCreep(creep);

    if (pullingCreep) {
      creep.move(pullingCreep);
    }

    let sentPullRequest = false;
    for (const containerPos of creep.room.memory.positions[STRUCTURE_CONTAINER]) {
      if (sentPullRequest) break;

      const sources = creep.room.find(FIND_SOURCES);

      for (const source of sources) {
        if (!source.pos.isNearTo(containerPos.x, containerPos.y)) continue;

        const creeps = creep.room.lookForAt(LOOK_CREEPS, containerPos.x, containerPos.y).filter(c => c.my);

        if (creeps.length === 1 && creeps[0].memory.role === creepRoles.MINER) continue;

        if (!creep.room.memory.events) creep.room.memory.events = [];

        creep.room.memory.events.push(
          new PullRequestEvent(new RoomPosition(containerPos.x, containerPos.y, creep.room.name), creep.id)
        );
        sentPullRequest = true;
        break;
      }
    }
  }

  private findNearbyPullerCreep(creep: Creep): Creep | null {
    const dirs = [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
      [1, 0],
      [0, 1]
    ];

    for (const dir of dirs) {
      const creeps = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x + dir[0], creep.pos.y + dir[1]);

      for (const nearbyCreep of creeps) {
        if (nearbyCreep.my && nearbyCreep.memory.role === creepRoles.PULLER) {
          return nearbyCreep;
        }
      }
    }

    return null;
  }
}
