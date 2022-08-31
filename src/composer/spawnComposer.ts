import * as creepRoles from "creeps/roles"
import BuilderSpawnHandler from "creeps/spawn/builderSpawnHandler"
import ClaimerSpawnHandler from "creeps/spawn/claimerSpawnHandler"
import HaulerSpawnHandler from "creeps/spawn/haulerSpawnHandler"
import HealerSpawnHandler from "creeps/spawn/healerSpawnHandler"
import ISpawnHandler from "creeps/spawn/ISpawnHandler"
import MeleeDefenderSpawnHandler from "creeps/spawn/meleeDefenderSpawnHandler"
import MinerSpawnHandler from "creeps/spawn/minerSpawnHandler"
import PullerSpawnHandler from "creeps/spawn/pullerSpawnHandler"
import RepairerSpawnHandler from "creeps/spawn/repairerSpawnHandler"
import ScoutSpawnHandler from "creeps/spawn/scoutSpawnHandler"
import UpgraderSpawnHandler from "creeps/spawn/upgraderSpawnHandler"
import generateGuid from "utils/guidGenerator"

export default class SpawnComposer {
  public compose(): void {
    for (const spawnName in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnName]
      if (spawn.spawning) continue

      for (let spawner of this.spawners(spawn)) {
        const spawnConfig = spawner.spawnCreep(spawn.room)
        if (!spawnConfig) continue
        const cost = spawnConfig.getBody().reduce((acc, val) => acc + BODYPART_COST[val], 0)
        if (spawn.room.energyAvailable < cost) continue

        console.log("Spawning", spawnConfig.getRole())

        spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
          memory: {
            role: spawnConfig.getRole(),
            working: false,
            room: spawn.room.name,
            targetRoomPos: { x: 0, y: 0, roomName: spawn.room.name }
          }
        })
        return
      }
    }
  }

  public spawners(spawn: StructureSpawn): ISpawnHandler[] {
    const creepPopulationDict: { [key: string]: number } = this.creepPopulationDict()

    return [
      new MeleeDefenderSpawnHandler(creepPopulationDict, spawn),
      new HealerSpawnHandler(creepPopulationDict, spawn),
      new PullerSpawnHandler(creepPopulationDict),
      new HaulerSpawnHandler(creepPopulationDict),
      new MinerSpawnHandler(creepPopulationDict, spawn),
      new BuilderSpawnHandler(creepPopulationDict),
      new RepairerSpawnHandler(creepPopulationDict),
      new UpgraderSpawnHandler(creepPopulationDict),
      new ScoutSpawnHandler(creepPopulationDict),
      new ClaimerSpawnHandler(creepPopulationDict)
    ]
  }

  private creepPopulationDict(): { [key: string]: number } {
    const creepDict: { [key: string]: number } = {}

    for (const creepRole in creepRoles) {
      creepDict[creepRole] = 0
    }

    for (const creepName in Game.creeps) {
      creepDict[Game.creeps[creepName].memory.role] += 1
    }

    return creepDict
  }
}
