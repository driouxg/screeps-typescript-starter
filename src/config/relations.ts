import { controls } from "./controls"
import { myUsername } from "utils/username"
import { forgetOldAggression, logIncident, logOurAttack, noteFlagged } from "defence/aggressionLog"

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

/** How an attack was made, from its event's attackType. */
const HOW: { [type: number]: string } = {
  [EVENT_ATTACK_TYPE_MELEE]: "melee",
  [EVENT_ATTACK_TYPE_RANGED]: "ranged",
  [EVENT_ATTACK_TYPE_RANGED_MASS]: "mass ranged",
  [EVENT_ATTACK_TYPE_DISMANTLE]: "dismantle",
  [EVENT_ATTACK_TYPE_HIT_BACK]: "hit back",
  [EVENT_ATTACK_TYPE_NUKE]: "nuke"
}

/** An attacker or target from an event, alive or not (a creep killed that tick left a tombstone, a structure a ruin). */
interface Party {
  owner?: string
  my: boolean
  /** "tower", "creep: 4 ATTACK, 4 MOVE" for an attacker; "our REMOTE_MINER", "our spawn" for a target of ours. */
  label: string
  /** For our attacks on others: "creep" or the structure type. */
  what: string
}

/**
 * Flag players who attacked us in the rooms we can see this tick: their creeps' or towers' attacks on our creeps,
 * structures or controller, and log each attack (see defence/aggressionLog) with where, what and whether we started
 * it, for the dashboard. Not flagged: allies (a warning is logged instead), anyone with aggression "passive" (see
 * config/controls), and a creep's automatic hit back when one of ours hit it in melee: that's the game's doing, not
 * theirs. Our own attacks on other players are remembered too, as provocation.
 *
 * The event log is last tick's: a creep or structure killed by an attack is gone by now, so it's found by its
 * tombstone or ruin (missing those had let killing blows, the worst attacks, go unrecorded).
 */
export function recordAggression(): void {
  const passive = controls().aggression === "passive"
  const me = myUsername()
  for (const room of Object.values(Game.rooms)) {
    const events = room.getEventLog()
    if (!events.length) continue
    const destroyed = new Set(
      events.filter(e => e.event === EVENT_OBJECT_DESTROYED).map(e => e.objectId)
    )
    const cache = new Map<string, Party | null>()
    const party = (id: string) => {
      if (!cache.has(id)) cache.set(id, resolve(room, id))
      return cache.get(id)!
    }

    for (const e of events) {
      if (e.event !== EVENT_ATTACK && e.event !== EVENT_ATTACK_CONTROLLER) continue
      const attacker = party(e.objectId)
      const owner = attacker?.owner
      if (!attacker || !owner) continue
      const data = (e.event === EVENT_ATTACK ? e.data : {}) as { targetId?: string; damage?: number; attackType?: number }
      const how = e.event === EVENT_ATTACK_CONTROLLER ? "controller attack" : HOW[data.attackType ?? 0] ?? "attack"

      const target: Party | null =
        e.event === EVENT_ATTACK_CONTROLLER
          ? room.controller
            ? { owner: room.controller.owner?.username, my: room.controller.my, label: "our controller", what: "controller" }
            : null
          : data.targetId
          ? party(data.targetId)
          : null
      if (!target) continue

      // Ours on theirs: remembered as provocation for when they hit back.
      if (owner === me) {
        if (target.owner && target.owner !== me && !NPC_PLAYERS.includes(target.owner) && how !== "hit back")
          logOurAttack(target.owner, room.name, target.what)
        continue
      }
      if (NPC_PLAYERS.includes(owner) || !target.my) continue

      const incident = logIncident(owner, {
        tick: Game.time,
        room: room.name,
        roomObject: room,
        attacker: attacker.label,
        target: target.label,
        how,
        damage: data.damage ?? 0,
        hits: 1,
        killed: data.targetId && destroyed.has(data.targetId) ? 1 : 0
      })

      if (isAlly(owner)) {
        console.log(`Ally ${owner} attacked ${target.label} in ${room.name}; not flagging allies automatically`)
        continue
      }
      if (passive || how === "hit back" || Memory.hostilePlayers?.[owner] !== undefined) continue
      const what = `${how} attack on ${target.label} in ${room.name} (${incident.where}) by ${attacker.label}`
      Memory.hostilePlayers = { ...(Memory.hostilePlayers ?? {}), [owner]: Game.time }
      noteFlagged(owner, `${what}${incident.provoked ? `; note: ${incident.provoked}` : ""}`)
      console.log(
        `${owner} attacked us: ${what}, ${data.damage ?? 0} damage${incident.killed ? ", a killing blow" : ""}${
          incident.provoked ? ` (note: ${incident.provoked})` : ""
        }. Now treated as hostile`
      )
    }
  }
  if (Game.time % 1000 === 0) forgetOldAggression()
}

/** The creep, power creep or structure with `id`, alive or (killed last tick) by its tombstone or ruin. */
function resolve(room: Room, id: string): Party | null {
  const alive = Game.getObjectById(id as Id<Creep | PowerCreep | Structure>)
  if (alive) return describe(alive)
  const tombstone = room.find(FIND_TOMBSTONES).find(t => t.creep.id === id)
  if (tombstone) return describe(tombstone.creep)
  const ruin = room.find(FIND_RUINS).find(r => r.structure.id === id)
  return ruin ? describe(ruin.structure) : null
}

function describe(object: Creep | PowerCreep | Structure): Party {
  const owner = "owner" in object ? object.owner?.username : undefined
  const my = "my" in object ? !!object.my : false
  if ("body" in object) {
    const creep = object
    const role = creep.my ? Memory.creeps?.[creep.name]?.role : undefined
    return { owner, my, label: my ? `our ${role ?? "creep"}` : `creep: ${bodySummary(creep.body)}`, what: "creep" }
  }
  if (!("structureType" in object)) return { owner, my, label: my ? "our power creep" : "power creep", what: "power creep" }
  const type = object.structureType
  return { owner, my, label: my ? `our ${type}` : type, what: type }
}

/** "4 ATTACK, 2 HEAL, 6 MOVE". */
function bodySummary(body: BodyPartDefinition[]): string {
  const counts = new Map<string, number>()
  for (const part of body) counts.set(part.type, (counts.get(part.type) ?? 0) + 1)
  return [...counts].map(([part, n]) => `${n} ${part.toUpperCase()}`).join(", ")
}
