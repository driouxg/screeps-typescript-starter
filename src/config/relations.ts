import { controls } from "./controls"
import { myUsername } from "utils/username"

/**
 * How we treat each player:
 *
 * - ally:    we path through their rooms, never mine or reserve them, never attack their creeps.
 * - neutral: everyone we haven't classified. Same as allies, except that a neutral who attacks us becomes hostile.
 * - hostile: ENEMIES / Memory.enemies, NPCs (invaders, source keepers), and any player seen attacking our creeps,
 *            structures or controller. We avoid their rooms and our defence fights their creeps.
 *
 * Edit the lists here, or at runtime from the console:
 *   Memory.allies = ["SomePlayer"]      Memory.enemies = ["OtherPlayer"]
 *   delete Memory.hostilePlayers["SomePlayer"]   (forgive a player that was flagged automatically)
 */
export const ALLIES: string[] = []
export const ENEMIES: string[] = []

/** The game's NPC players; always hostile. */
const NPC_PLAYERS = ["Invader", "Source Keeper"]

export type Relation = "me" | "ally" | "neutral" | "hostile"

declare global {
  interface Memory {
    allies?: string[]
    enemies?: string[]
    /** Players flagged hostile because they attacked us, with the tick they were first seen doing it. */
    hostilePlayers?: { [username: string]: number }
  }
}

export function relationOf(username: string | undefined): Relation {
  if (!username) return "neutral"
  if (username === myUsername()) return "me"
  if (ALLIES.includes(username) || (Memory.allies ?? []).includes(username)) return "ally"
  if (NPC_PLAYERS.includes(username)) return "hostile"
  if (ENEMIES.includes(username) || (Memory.enemies ?? []).includes(username)) return "hostile"
  if (Memory.hostilePlayers?.[username] !== undefined) return "hostile"
  return "neutral"
}

export function isAlly(username: string | undefined): boolean {
  return relationOf(username) === "ally"
}

/** Whether a player's creeps are ones we fight and whose rooms we avoid. */
export function isHostilePlayer(username: string | undefined): boolean {
  return relationOf(username) === "hostile"
}

/**
 * Whether a creep (or power creep) is hostile: it belongs to a hostile player, or (with aggression "aggressive", see
 * config/controls) it's an armed creep of a player who isn't an ally.
 */
export function isHostile(creep: { owner: Owner; body?: BodyPartDefinition[] }): boolean {
  const relation = relationOf(creep.owner.username)
  if (relation === "hostile") return true
  if (relation !== "neutral" || controls().aggression !== "aggressive") return false
  return (creep.body ?? []).some(p => 0 < p.hits && (p.type === ATTACK || p.type === RANGED_ATTACK))
}

/**
 * Flag players who attacked us in the rooms we can see this tick: their creeps' or towers' attacks on our creeps,
 * structures or controller. Allies are never flagged (a warning is logged instead).
 */
export function recordAggression(): void {
  // Passive: nobody becomes hostile just for attacking us (see config/controls).
  if (controls().aggression === "passive") return
  for (const room of Object.values(Game.rooms)) {
    for (const e of room.getEventLog()) {
      if (e.event !== EVENT_ATTACK && e.event !== EVENT_ATTACK_CONTROLLER) continue
      const attacker = Game.getObjectById(e.objectId as Id<Creep | StructureTower>)
      const owner = attacker && "owner" in attacker ? attacker.owner?.username : undefined
      if (!owner || owner === myUsername() || NPC_PLAYERS.includes(owner)) continue

      const target =
        e.event === EVENT_ATTACK_CONTROLLER
          ? room.controller
          : Game.getObjectById((e.data as { targetId: string }).targetId as Id<Creep | Structure>)
      const ours = !!target && "my" in target && target.my
      if (!ours) continue

      if (isAlly(owner)) {
        console.log(`Ally ${owner} attacked us in ${room.name}; not flagging allies automatically`)
        continue
      }
      if (Memory.hostilePlayers?.[owner] === undefined) {
        Memory.hostilePlayers = { ...(Memory.hostilePlayers ?? {}), [owner]: Game.time }
        console.log(`${owner} attacked us in ${room.name}: now treated as hostile`)
      }
    }
  }
}
