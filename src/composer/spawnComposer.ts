import * as creepRoles from "creeps/roles"
import BuilderSpawnHandler from "creeps/spawn/builderSpawnHandler"
import ClaimerSpawnHandler from "creeps/spawn/claimerSpawnHandler"
import ExpanderSpawnHandler from "creeps/spawn/expanderSpawnHandler"
import HaulerSpawnHandler from "creeps/spawn/haulerSpawnHandler"
import HealerSpawnHandler from "creeps/spawn/healerSpawnHandler"
import ISpawnHandler from "creeps/spawn/ISpawnHandler"
import MeleeDefenderSpawnHandler from "creeps/spawn/meleeDefenderSpawnHandler"
import MinerSpawnHandler from "creeps/spawn/minerSpawnHandler"
import PullerSpawnHandler from "creeps/spawn/pullerSpawnHandler"
import RemoteMinerSpawnHandler from "creeps/spawn/remoteMinerSpawnHandler"
import ScoutSpawnHandler from "creeps/spawn/scoutSpawnHandler"
import UpgraderSpawnHandler from "creeps/spawn/upgraderSpawnHandler"
import WatcherSpawnHandler from "creeps/spawn/watcherSpawnHandler"
import generateGuid from "utils/guidGenerator"

export default class SpawnComposer {
  public compose(): void {
    for (const spawnName in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnName]
      if (spawn.spawning) continue

      for (let spawner of this.spawners()) {
        const spawnConfig = spawner.spawnCreep(spawn)
        if (!spawnConfig) continue
        const cost = spawnConfig.getBody().reduce((acc, val) => acc + BODYPART_COST[val], 0)
        if (spawn.room.energyAvailable < cost) continue

        console.log("Spawning", spawnConfig.getRole(), spawn.room.name)

        spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
          memory: {
            role: spawnConfig.getRole(),
            working: false,
            room: spawn.room.name,
            ...spawnConfig.getMemory()
          }
        })
        return
      }
    }
  }

  public spawners(): ISpawnHandler[] {
    const creepPopulationDict: { [key: string]: number } = this.creepPopulationDict()

    return [
      new MeleeDefenderSpawnHandler(),
      new HealerSpawnHandler(creepPopulationDict),
      new PullerSpawnHandler(),
      new HaulerSpawnHandler(),
      new MinerSpawnHandler(),
      new BuilderSpawnHandler(),
      new UpgraderSpawnHandler(),
      new ScoutSpawnHandler(),
      new WatcherSpawnHandler(),
      new RemoteMinerSpawnHandler(creepPopulationDict),
      new ClaimerSpawnHandler(creepPopulationDict),
      new ExpanderSpawnHandler(creepPopulationDict)
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
