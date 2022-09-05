import settings from "settings"
import ConstructionPosition from "./constructionPosition"

export default class DesiredStateConstructor {
  private desiredSitesConstructedPerTick: number

  public constructor() {
    this.desiredSitesConstructedPerTick = settings.constructionSite.desiredSitesConstructedPerTick
  }

  public construct(room: Room, desiredState: string[][]): void {
    if (!desiredState) return

    // const constructionPos: ConstructionPosition = new ConstructionPosition(room.memory.constructionPos)

    // let sitesReviewed = 0

    // while (sitesReviewed < this.desiredSitesConstructedPerTick) {
    //   const x: number = constructionPos.getX(),
    //     y = constructionPos.getY()

    //   if (desiredState[y][x] !== "")
    //     room.createConstructionSite(x, y, this.mapStringToStructureConstant(desiredState[y][x]))

    //   sitesReviewed++
    //   constructionPos.increment()
    // }

    room.memory.positions = room.memory.positions ?? {}

    for (let structureName of this.getPrioritizedBuildList()) {
      if (!room.memory.positions[structureName]) continue
      for (let position of room.memory.positions[structureName]) {
        if (Game.cpu.limit + 1 <= Game.cpu.getUsed()) return
        room.createConstructionSite(position.x, position.y, structureName as BuildableStructureConstant)
      }
    }

    this.buildRamparts(room)
    // room.memory.constructionPos = constructionPos.serialize()
  }

  private buildRamparts(room: Room): void {
    if (!room.memory.positions[STRUCTURE_RAMPART]) return

    for (const pos of room.memory.positions[STRUCTURE_RAMPART]) {
      room.createConstructionSite(pos.x, pos.y, STRUCTURE_RAMPART)
    }
  }

  private getPrioritizedBuildList() {
    return [
      STRUCTURE_CONTAINER,
      STRUCTURE_EXTENSION,
      STRUCTURE_SPAWN,
      STRUCTURE_TOWER,
      STRUCTURE_WALL,
      STRUCTURE_RAMPART,
      STRUCTURE_STORAGE,
      STRUCTURE_SPAWN,
      STRUCTURE_POWER_SPAWN,
      STRUCTURE_NUKER,
      STRUCTURE_OBSERVER,
      STRUCTURE_LAB,
      STRUCTURE_LINK,
      STRUCTURE_TERMINAL,
      STRUCTURE_FACTORY,
      STRUCTURE_EXTRACTOR,
      STRUCTURE_NUKER,
      STRUCTURE_ROAD
    ]
  }

  private mapStringToStructureConstant(text: string): BuildableStructureConstant {
    switch (text) {
      case STRUCTURE_TOWER:
        return STRUCTURE_TOWER
      case STRUCTURE_WALL:
        return STRUCTURE_WALL
      case STRUCTURE_ROAD:
        return STRUCTURE_ROAD
      case STRUCTURE_RAMPART:
        return STRUCTURE_RAMPART
      case STRUCTURE_STORAGE:
        return STRUCTURE_STORAGE
      case STRUCTURE_SPAWN:
        return STRUCTURE_SPAWN
      case STRUCTURE_POWER_SPAWN:
        return STRUCTURE_POWER_SPAWN
      case STRUCTURE_CONTAINER:
        return STRUCTURE_CONTAINER
      case STRUCTURE_EXTENSION:
        return STRUCTURE_EXTENSION
      case STRUCTURE_NUKER:
        return STRUCTURE_NUKER
      case STRUCTURE_OBSERVER:
        return STRUCTURE_OBSERVER
      case STRUCTURE_LAB:
        return STRUCTURE_LAB
      case STRUCTURE_LINK:
        return STRUCTURE_LINK
      case STRUCTURE_TERMINAL:
        return STRUCTURE_TERMINAL
      case STRUCTURE_FACTORY:
        return STRUCTURE_FACTORY
      case STRUCTURE_EXTRACTOR:
        return STRUCTURE_EXTRACTOR
      default:
        return STRUCTURE_NUKER
    }
  }
}
