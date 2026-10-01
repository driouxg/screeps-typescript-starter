import { assessThreat, creepsKilledSince, defensiveDamage } from "defence/threat"
import { defenderBody, MAX_DEFENDERS } from "creeps/spawn/meleeDefenderSpawnHandler"
import * as creepRoles from "creeps/roles"
import IStructureActionHandler from "./IStructureActionHandler"

/** A raider this close to a spawn is about to start killing what we can't replace. */
const DANGER_RANGE = 8
/** Losing more than this share of the spawn's hits means the fight is going badly. */
const SPAWN_HITS_FLOOR = 0.7
/** Creeps we're willing to lose to a raid before using a charge. */
const ACCEPTABLE_LOSSES = 1
/**
 * Below this RCL the room has no ramparts (see DEFENCE_MIN_RCL) and little to defend with, and the fastest way to
 * grow is to not divert energy into fighting: any real attack gets safe mode straight away.
 */
const EARLY_SAFE_MODE_RCL = 5

declare global {
  interface RoomMemory {
    /** Tick the current raid started, while hostile fighters are in the room. */
    raidStart?: number
  }
}

/**
 * Goal: Use safe mode as the emergency brake, without wasting charges. While it's on, hostile creeps can't act in
 * the room at all, which lets defenders kill them for free. But charges are scarce (one to start, one per RCL
 * reached), so it's only used when:
 *
 * - we're below EARLY_SAFE_MODE_RCL and hostile fighters come near a spawn or hit anything; or
 * - the raid is hopeless: the hostiles out-damage everything we could field (towers, current defenders, and a full
 *   set of defenders at our energy capacity), and they're near a spawn or attacking; or
 * - the fight is going badly: a spawn has lost 30% of its hits, or the raid has killed more than
 *   ACCEPTABLE_LOSSES of our creeps.
 */
export default class SafeModeHandler implements IStructureActionHandler {
  public handle(room: Room): void {
    const threat = assessThreat(room)
    if (threat.hostiles.length <= 0) {
      delete room.memory.raidStart
      return
    }
    room.memory.raidStart = room.memory.raidStart ?? Game.time

    const controller = room.controller
    if (!controller?.my || controller.safeMode || controller.safeModeCooldown || controller.upgradeBlocked) return
    if (!controller.safeModeAvailable) return

    const spawns = room.find(FIND_MY_SPAWNS)
    const threatened =
      threat.hostiles.some(h => spawns.some(s => h.pos.inRangeTo(s, DANGER_RANGE))) ||
      this.underAttack(room, threat.hostiles)
    if (!threatened) return

    const early = controller.level < EARLY_SAFE_MODE_RCL
    const hopeless = this.potentialDamage(room) < threat.damage + threat.healing
    const spawnFailing = spawns.some(s => s.hits < s.hitsMax * SPAWN_HITS_FLOOR)
    const losingCreeps = ACCEPTABLE_LOSSES < creepsKilledSince(room, room.memory.raidStart)
    if (!early && !hopeless && !spawnFailing && !losingCreeps) return

    const code = controller.activateSafeMode()
    const why = early
      ? `attacked before RCL ${EARLY_SAFE_MODE_RCL}`
      : hopeless
      ? "raid is hopeless"
      : spawnFailing
      ? "spawn is failing"
      : "losing creeps"
    console.log(`Safe mode in ${room.name} (${why}): ${code === OK ? "activated" : `failed (${code})`}`)
  }

  /** Damage per tick we could reach: what's here now plus a full set of defenders at our energy capacity. */
  private potentialDamage(room: Room): number {
    const defenders = room.find(FIND_MY_CREEPS, { filter: c => c.memory.role === creepRoles.MELEE_DEFENDER }).length
    const perDefender = defenderBody(room.energyCapacityAvailable).filter(p => p === ATTACK).length * ATTACK_POWER
    return defensiveDamage(room) + Math.max(0, MAX_DEFENDERS - defenders) * perDefender
  }

  /** Whether any hostile hit one of our creeps or structures this tick. */
  private underAttack(room: Room, hostiles: Creep[]): boolean {
    const ids = new Set<string>(hostiles.map(h => h.id))
    return room
      .getEventLog()
      .some(e => (e.event === EVENT_ATTACK || e.event === EVENT_ATTACK_CONTROLLER) && ids.has(e.objectId))
  }
}
