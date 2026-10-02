import settings from "settings"

/** The overlay is redrawn at least this often (structures get built, sites placed); in between it's replayed. */
const REDRAW_TICKS = 20

declare global {
  interface Memory {
    /** Rooms whose build plan is drawn in the game (toggled from the dashboard; see ConstructionSiteVisualizer). */
    buildPlanOverlay?: { [roomName: string]: boolean | null }
  }
}

/** Drawn overlays, per room: replayed with RoomVisual.import instead of redrawing every step every tick. */
const cache = new Map<string, { tick: number; key: string; visual: string }>()

/**
 * Goal: Show a room's build plan (room.memory.buildOrder) in the game, when switched on for the room from the dashboard
 * (Memory.buildPlanOverlay) or for every room in settings.
 *
 * Steps not built yet are drawn: each structure as a short label (see displayText), roads as dots, ramparts and walls
 * as outlined squares. Yellow where a construction site is placed, white otherwise.
 */
export default class ConstructionSiteVisualizer {
  public handle(room: Room): void {
    if (!settings.constructionSite.visualize && !Memory.buildPlanOverlay?.[room.name]) {
      cache.delete(room.name)
      return
    }
    const buildOrder = room.memory.buildOrder
    if (!buildOrder?.length) return

    const structures = room.find(FIND_STRUCTURES)
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES)
    const key = `${buildOrder.length}:${structures.length}:${sites.length}`
    const cached = cache.get(room.name)
    if (cached && cached.key === key && Game.time - cached.tick < REDRAW_TICKS) {
      room.visual.import(cached.visual)
      return
    }

    // Only what this draws is cached, not other visuals drawn in the room this tick. export() gives undefined, not "",
    // while nothing has been drawn in the room yet.
    const before = (room.visual.export() ?? "").length
    this.draw(room, buildOrder, structures, sites)
    cache.set(room.name, { tick: Game.time, key, visual: (room.visual.export() ?? "").slice(before) })
  }

  private draw(room: Room, buildOrder: BuildOrderStep[], structures: Structure[], sites: ConstructionSite[]): void {
    const at = (x: number, y: number, type: string) => `${x},${y},${type}`
    const built = new Set(structures.map(s => at(s.pos.x, s.pos.y, s.structureType)))
    const placed = new Set(sites.map(s => at(s.pos.x, s.pos.y, s.structureType)))

    for (const step of buildOrder) {
      const k = at(step.x, step.y, step.structureType)
      if (built.has(k)) continue
      const color = placed.has(k) ? "#ffd84d" : "#ffffff"
      const { x, y, structureType: type } = step
      if (type === STRUCTURE_ROAD) room.visual.circle(x, y, { radius: 0.12, fill: color, opacity: 0.6 })
      else if (type === STRUCTURE_RAMPART || type === STRUCTURE_WALL)
        room.visual.rect(x - 0.45, y - 0.45, 0.9, 0.9, {
          fill: "transparent",
          stroke: type === STRUCTURE_RAMPART ? "#4dd26b" : "#9aa0a6",
          strokeWidth: 0.06,
          opacity: placed.has(k) ? 0.9 : 0.6
        })
      else
        room.visual.text(this.displayText(type), x, y + 0.15, {
          color,
          font: 0.4,
          stroke: "#000000",
          strokeWidth: 0.08,
          opacity: 0.85
        })
    }
  }

  private displayText(text: string): string {
    switch (text) {
      case STRUCTURE_TOWER:
        return "To"
      case STRUCTURE_WALL:
        return "W"
      case STRUCTURE_ROAD:
        return "r"
      case STRUCTURE_RAMPART:
        return "R"
      case STRUCTURE_STORAGE:
        return "Stg"
      case STRUCTURE_SPAWN:
        return "Sp"
      case STRUCTURE_POWER_SPAWN:
        return "sPsp"
      case STRUCTURE_CONTAINER:
        return "C"
      case STRUCTURE_EXTENSION:
        return "E"
      case STRUCTURE_NUKER:
        return "N"
      case STRUCTURE_OBSERVER:
        return "O"
      case STRUCTURE_LAB:
        return "La"
      case STRUCTURE_LINK:
        return "Li"
      case STRUCTURE_TERMINAL:
        return "Ter"
      case STRUCTURE_FACTORY:
        return "F"
      case STRUCTURE_EXTRACTOR:
        return "Ex"
      default:
        return "."
    }
  }
}
