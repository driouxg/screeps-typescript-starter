import BuilderSpawnHandler from "creeps/spawn/builderSpawnHandler"
import ClaimerSpawnHandler from "creeps/spawn/claimerSpawnHandler"
import ExpanderSpawnHandler from "creeps/spawn/expanderSpawnHandler"
import HaulerSpawnHandler from "creeps/spawn/haulerSpawnHandler"
import HealerSpawnHandler from "creeps/spawn/healerSpawnHandler"
import ISpawnHandler from "creeps/spawn/ISpawnHandler"
import MeleeDefenderSpawnHandler from "creeps/spawn/meleeDefenderSpawnHandler"
import MinerSpawnHandler from "creeps/spawn/minerSpawnHandler"
import PullerSpawnHandler from "creeps/spawn/pullerSpawnHandler"
import RapidFillerSpawnHandler from "creeps/spawn/rapidFillerSpawnHandler"
import RemoteSpawnHandler from "creeps/spawn/remoteSpawnHandler"
import RemoteDefenderSpawnHandler from "creeps/spawn/remoteDefenderSpawnHandler"
import RetaliationSpawnHandler from "creeps/spawn/retaliationSpawnHandler"
import ContestSpawnHandler from "creeps/spawn/contestSpawnHandler"
import ConquestSpawnHandler from "creeps/spawn/conquestSpawnHandler"
import { renewingThisTick } from "conquest/conquest"
import ScoutSpawnHandler from "creeps/spawn/scoutSpawnHandler"
import ReconSpawnHandler from "creeps/spawn/reconSpawnHandler"
import UpgraderSpawnHandler from "creeps/spawn/upgraderSpawnHandler"
import WatcherSpawnHandler from "creeps/spawn/watcherSpawnHandler"
import generateGuid from "utils/guidGenerator"

export default class SpawnComposer {
  public compose(): void {
    for (const spawnName in Game.spawns) {
      const spawn: StructureSpawn = Game.spawns[spawnName]
      // A spawn renewing a conquest squad this tick (see conquest/conquest) can't spawn too.
      if (spawn.spawning || renewingThisTick(spawn)) continue

      for (let spawner of this.spawners()) {
        const spawnConfig = spawner.spawnCreep(spawn)
        if (!spawnConfig || spawnConfig.getBody().length === 0) continue
        const cost = spawnConfig.getBody().reduce((acc, val) => acc + BODYPART_COST[val], 0)
        if (spawn.room.energyAvailable < cost) {
          // Saving up for this creep: don't let lower priorities spend the energy meanwhile.
          if (spawnConfig.shouldWaitForEnergy()) break
          continue
        }

        const directions = spawnConfig.getDirections()
        const code = spawn.spawnCreep(spawnConfig.getBody(), generateGuid(), {
          memory: {
            role: spawnConfig.getRole(),
            working: false,
            room: spawn.room.name,
            ...spawnConfig.getMemory()
          },
          ...(directions ? { directions } : {})
        })
        console.log(`Spawning ${spawnConfig.getRole()} ${spawn.room.name}${code === OK ? "" : ` failed (${code})`}`)
        return
      }
    }
  }

  public spawners(): ISpawnHandler[] {
    return [
      new MeleeDefenderSpawnHandler(),
      new HealerSpawnHandler(),
      // A room the player asked to scout (see ReconSpawnHandler): one MOVE part, 50 energy, never saves up. Ahead of
      // everything but defence: behind the squads that save up for their bodies, it never got its turn.
      new ReconSpawnHandler(),
      new PullerSpawnHandler(),
      // Miners and one hauler each come first, alternating, so energy is flowing before anything else spawns.
      new HaulerSpawnHandler("minimum"),
      // One upgrader right away: the controller is the only thing to spend on at RCL 1.
      new UpgraderSpawnHandler("first"),
      new MinerSpawnHandler(),
      // Two builders once the sources are staffed: they upgrade until RCL 2, then start on the extensions straight away.
      new BuilderSpawnHandler("first"),
      // Defending remote mining comes before growing it: a weak raider left alone kills miner after hauler.
      new RemoteDefenderSpawnHandler(),
      // A strike the player asked for (see defence/retaliation): a one-off, so it goes ahead of growing the economy,
      // or a busy spawn would never get to it.
      new RetaliationSpawnHandler(),
      // A conquest the player approved (see conquest/conquest): its squad saves up ahead of the economy, or a busy
      // home would never field it.
      new ConquestSpawnHandler(),
      // More haulers before more workers: workers can only spend what gets delivered to them.
      new HaulerSpawnHandler("backlog"),
      // Cheap, and once in place they take over filling the rapid fill's spawns and extensions.
      new RapidFillerSpawnHandler(),
      // Expansion (see ExpansionPlanner) is a one-off investment that saves up ahead of the workers.
      new ClaimerSpawnHandler(),
      new ExpanderSpawnHandler(),
      // Taking a remote from a weaker player (see remote/contest): a few creeps for a lot more income. Ahead of the
      // remotes we mine, whose haulers would otherwise take every turn and leave the contest without its reserver.
      new ContestSpawnHandler(),
      // Remote mining is income (see RemotePlanner), so it's staffed before the workers that spend it.
      new RemoteSpawnHandler(),
      // Remotes and expansion targets have to be found first: a 50 energy scout while there's anything left to find.
      new ScoutSpawnHandler("needed"),
      // Workers are sized by the energy budget (see utils/economy.ts). Builders get first claim while
      // construction sites exist.
      new BuilderSpawnHandler("budget"),
      new UpgraderSpawnHandler("budget"),
      new ScoutSpawnHandler("refresh"),
      new WatcherSpawnHandler()
    ]
  }
}
