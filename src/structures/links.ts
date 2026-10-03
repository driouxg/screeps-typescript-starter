import { rapidFillOf } from "./rapidFill"

/**
 * Goal: Move energy around the base through links instead of on haulers' backs: from the sources, and from storage, to
 * where it's spent (the rapid fill, which refills the spawns and extensions, and the controller).
 *
 * Each link is one of (linkKind, by where it stands):
 *   source      next to a source's container: its miner puts what it harvests in (see MinerHandler);
 *   rapid       the centre of the rapid fill stamp: its fillers take from it (see RapidFillerHandler);
 *   controller  next to the controller container: upgraders take from it (see UpgraderHandler);
 *   hub         next to storage: haulers fill it from storage when the links above need more than the sources send
 *               (hubWants, see findOffloadSpot);
 *   other       anything else: left alone.
 *
 * Every tick (runLinks), each source link and the hub link that's off cooldown and holds at least MIN_SEND sends to
 * the first receiver with room for at least MIN_SEND: the rapid link first (spawning must never wait), then the
 * controller link. A transfer costs LINK_LOSS_RATIO (3%) of what's sent whatever its size, so there's no gain in
 * waiting to send in bulk. A source link nobody needs fills up; its miner then lets the rest drop into its container,
 * for the haulers, as before links.
 *
 * Links are capped by RCL (2 at RCL 5, 3 at 6, 4 at 7, 6 at 8), so which are built first matters (linkRank): the
 * controller link and the farthest source's link (the longest haul each), then the hub, the rapid fill, and the
 * nearer sources.
 */

const MIN_SEND = 100

export type LinkKind = "source" | "rapid" | "controller" | "hub" | "other"

export interface RoomLinks {
  source: StructureLink[]
  rapid?: StructureLink
  controller?: StructureLink
  hub?: StructureLink
}

/** What a link at `pos` is for (see the top of this file), from where it stands. */
export function linkKind(room: Room, pos: { x: number; y: number }): LinkKind {
  const rapid = rapidFillOf(room)?.link
  if (rapid && rapid.x === pos.x && rapid.y === pos.y) return "rapid"
  if (room.find(FIND_SOURCES).some(s => s.pos.inRangeTo(pos.x, pos.y, 2))) return "source"
  if (room.controller?.pos.inRangeTo(pos.x, pos.y, 3)) return "controller"
  const storage = storagePos(room)
  if (storage && Math.max(Math.abs(storage.x - pos.x), Math.abs(storage.y - pos.y)) <= 2) return "hub"
  return "other"
}

/** The storage, or where the build order plans it. */
function storagePos(room: Room): { x: number; y: number } | undefined {
  if (room.storage) return room.storage.pos
  return room.memory.buildOrder?.find(s => s.structureType === STRUCTURE_STORAGE)
}

/**
 * Build order among links (lower first, see buildOrderConstructor.priorityOf): controller 0, the farthest source 1,
 * hub 2, rapid fill 3, other sources 4, anything else 5.
 */
export function linkRank(room: Room, pos: { x: number; y: number }): number {
  const kind = linkKind(room, pos)
  if (kind === "controller") return 0
  if (kind === "hub") return 2
  if (kind === "rapid") return 3
  if (kind !== "source") return 5
  // The source farthest from the storage (or spawn) is the longest haul: its link goes first.
  const from = storagePos(room) ?? room.find(FIND_MY_SPAWNS)[0]?.pos
  const sources = room.find(FIND_SOURCES)
  if (!from || sources.length < 2) return 1
  const range = (s: Source) => Math.max(Math.abs(s.pos.x - from.x), Math.abs(s.pos.y - from.y))
  const farthest = sources.reduce((a, b) => (range(b) > range(a) ? b : a))
  return farthest.pos.inRangeTo(pos.x, pos.y, 2) ? 1 : 4
}

let cacheTick = -1
const cache = new Map<string, RoomLinks>()

/** The room's built links, by kind (cached for the tick). */
export function roomLinks(room: Room): RoomLinks {
  if (cacheTick !== Game.time) {
    cacheTick = Game.time
    cache.clear()
  }
  const cached = cache.get(room.name)
  if (cached) return cached
  const links: RoomLinks = { source: [] }
  for (const link of room.find(FIND_MY_STRUCTURES, { filter: (s): s is StructureLink => s.structureType === STRUCTURE_LINK })) {
    const kind = linkKind(room, link.pos)
    if (kind === "source") links.source.push(link)
    else if (kind !== "other" && !links[kind]) links[kind] = link
  }
  cache.set(room.name, links)
  return links
}

/** The link next to a source (its miner fills it), if built. */
export function sourceLinkOf(room: Room, source: Source): StructureLink | undefined {
  return roomLinks(room).source.find(l => l.pos.inRangeTo(source, 2))
}

/** Send energy from the source and hub links to the rapid fill and controller links (see the top of this file). */
export function runLinks(room: Room): void {
  const links = roomLinks(room)
  const receivers = [links.rapid, links.controller].filter((l): l is StructureLink => !!l)
  if (receivers.length <= 0) return
  const incoming = new Map<string, number>()
  const space = (l: StructureLink) => l.store.getFreeCapacity(RESOURCE_ENERGY) - (incoming.get(l.id) ?? 0)

  const senders = [...links.source, ...(links.hub ? [links.hub] : [])]
  for (const from of senders) {
    if (0 < from.cooldown || from.store.energy < MIN_SEND) continue
    const to = receivers.find(r => r.id !== from.id && MIN_SEND <= space(r))
    if (!to) continue
    const amount = Math.min(from.store.energy, space(to))
    if (from.transferEnergy(to, amount) === OK) incoming.set(to.id, (incoming.get(to.id) ?? 0) + amount)
  }
}

/**
 * Energy the hub link wants from storage (see findOffloadSpot): its free room, while the rapid fill and controller
 * links between them have more room than the source links hold to send them. 0 when there's no hub link, or the
 * sources keep up.
 */
export function hubWants(room: Room): number {
  const links = roomLinks(room)
  if (!links.hub) return 0
  const wanted = [links.rapid, links.controller].reduce(
    (sum, l) => sum + (l ? l.store.getFreeCapacity(RESOURCE_ENERGY) : 0),
    0
  )
  const supplied = links.source.reduce((sum, l) => sum + l.store.energy, 0) + links.hub.store.energy
  return wanted <= supplied ? 0 : links.hub.store.getFreeCapacity(RESOURCE_ENERGY)
}
