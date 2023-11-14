export default class ConstructionSiteVisualizer {
  public handle(room: Room, buildOrder: BuildOrderStep[]): void {
    // if (!settings.constructionSite.visualize) return

    this.print(room, buildOrder)
    return
  }

  private print(room: Room, buildOrder: BuildOrderStep[]): void {
    if (!buildOrder) return

    for (const step of buildOrder) {
      room.visual.text(this.displayText(step.structureType), step.x, step.y)
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
