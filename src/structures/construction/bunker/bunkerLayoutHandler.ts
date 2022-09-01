import distanceTransform from "utils/distanceTransform"
import { floodFill } from "utils/floodFill"
import { buildStringGrid } from "utils/gridBuilder"
import IConstructionHandler from "../IConstructionHandler"
import ILayoutHandler from "../ILayoutHandler"

/**
 * Goal: Build this bunker layout from: https://wiki.screepspl.us/index.php/File:BunkerExample.png
 *
 */
export default class BunkerConstructionHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[]
  private layout: string[][] = this.bunkerLayout()

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers
  }

  handle(room: Room): string[][] {
    room.memory.baseLayout = "bunker"
    let desiredState = buildStringGrid()

    for (const handler of this.constructionHandlers) desiredState = handler.handle(room, desiredState)

    const pos = this.findBunkerLocation(room)
    if (!pos) return desiredState
    this.markLayout(new RoomPosition(pos.x - 6, pos.y - 6, room.name), desiredState)

    console.log("Building bunker at", JSON.stringify(pos))

    return desiredState
  }

  private markLayout(pos: RoomPosition, desiredState: string[][]) {
    const x = pos.x,
      y = pos.y
    for (let yy = y; yy < 50 && yy < y + this.layout.length; yy++) {
      for (let xx = x; xx < 50 && xx < x + this.layout.length; xx++) {
        desiredState[yy][xx] = this.layout[yy - y][xx - x]
      }
    }
  }

  public isRoomForLayout(room: Room) {
    return this.findBunkerLocation(room) !== null
  }

  private findBunkerLocation(room: Room): { x: number; y: number } | null {
    const dt = distanceTransform(room.getTerrain(), false, 0, 0, 50, 50, room)
    const pos = room.controller?.pos
    if (!pos) return null

    let closestOptions: { x: number; y: number }[] = []
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (dt.get(y, x) >= 9) closestOptions.push({ x, y })
      }
    }

    const ff = floodFill([{ x: pos.x, y: pos.y }], room, true)

    if (closestOptions.length <= 0) return null
    let min = Number.MAX_SAFE_INTEGER
    let minPos = closestOptions[0]
    for (let cPos of closestOptions) {
      if (min < ff.get(cPos.x, cPos.y)) continue

      min = ff.get(cPos.x, cPos.y)
      minPos = cPos
    }

    return minPos
  }

  private bunkerLayout(): string[][] {
    return [
      ["", "", "", "", STRUCTURE_EXTENSION, "", "", "", STRUCTURE_EXTENSION, "", "", "", ""],
      [
        "",
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_SPAWN,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_TOWER,
        STRUCTURE_TOWER,
        STRUCTURE_TOWER,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_SPAWN,
        STRUCTURE_TOWER,
        STRUCTURE_ROAD,
        STRUCTURE_TOWER,
        STRUCTURE_SPAWN,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_ROAD,
        STRUCTURE_TOWER,
        STRUCTURE_ROAD,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        ""
      ],
      [
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_LINK,
        STRUCTURE_ROAD,
        STRUCTURE_POWER_SPAWN,
        STRUCTURE_ROAD,
        STRUCTURE_FACTORY,
        STRUCTURE_LAB,
        STRUCTURE_LAB,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_ROAD,
        STRUCTURE_ROAD,
        STRUCTURE_LAB,
        STRUCTURE_LAB,
        STRUCTURE_ROAD,
        STRUCTURE_LAB,
        ""
      ],
      [
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_LAB,
        STRUCTURE_ROAD,
        STRUCTURE_LAB,
        STRUCTURE_LAB,
        ""
      ],
      [
        "",
        "",
        STRUCTURE_EXTENSION,
        STRUCTURE_EXTENSION,
        STRUCTURE_ROAD,
        STRUCTURE_EXTENSION,
        STRUCTURE_NUKER,
        STRUCTURE_ROAD,
        STRUCTURE_ROAD,
        STRUCTURE_LAB,
        STRUCTURE_LAB,
        STRUCTURE_OBSERVER,
        ""
      ],
      ["", "", "", "", STRUCTURE_EXTENSION, "", "", "", STRUCTURE_EXTENSION, "", "", "", ""]
    ]
  }
}
