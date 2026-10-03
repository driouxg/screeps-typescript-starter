import * as creepRoles from "../roles"
import { remoteDefenderBody } from "defence/remoteDefence"
import ISpawnHandler from "./ISpawnHandler"
import SpawnConfig from "./SpawnConfig"
import { RemoteDefenderMemory } from "creeps/action/remoteDefenderHandler"

/**
 * Goal: Send as many defenders as defence/remoteDefence worked out it takes to win, to each room where hostiles
 * threaten this room's remote mining. Full size (the fight was weighed with full-size defenders), so it waits for
 * the energy. Defenders already out count wherever they are: they go where they're needed (RemoteDefenderHandler).
 */
export default class RemoteDefenderSpawnHandler implements ISpawnHandler {
  public spawnCreep(spawn: StructureSpawn): SpawnConfig | null {
    const home = spawn.room
    const threats = Object.entries(Memory.remoteThreats ?? {}).filter(([, t]) => t.home === home.name && t.defenders)
    if (threats.length <= 0) return null

    const defenders = Object.values(Game.creeps).filter(
      c => c.memory.role === creepRoles.REMOTE_DEFENDER && c.memory.room === home.name
    )
    for (const [room, threat] of threats) {
      const sent = defenders.filter(d => (d.memory as RemoteDefenderMemory).targetRoom === room).length
      const idle = defenders.some(d => !(d.memory as RemoteDefenderMemory).targetRoom)
      if (threat.defenders <= sent || idle) continue
      return new SpawnConfig(remoteDefenderBody(home.energyCapacityAvailable, !!threat.ranged), creepRoles.REMOTE_DEFENDER, {
        memory: { targetRoom: room } as RemoteDefenderMemory,
        waitForEnergy: true
      })
    }
    return null
  }
}
