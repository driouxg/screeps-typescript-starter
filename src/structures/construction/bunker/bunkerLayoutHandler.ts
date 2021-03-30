import { buildStringGrid } from "utils/gridBuilder";
import IConstructionHandler from "../IConstructionHandler";
import ILayoutHandler from "../ILayoutHandler";

export default class BunkerConstructionHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[];
  private layout: string[][] = this.bunkerLayout();

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers;
  }

  handle(room: Room): string[][] {
    let desiredState = buildStringGrid();

    for (const handler of this.constructionHandlers) desiredState = handler.handle(room, desiredState);

    for (let y = 3; y < 50; y++) {
      for (let x = 3; x < 50; x++) {
        if (!this.isRoomFromPosition(room, x, y)) continue;
        this.markLayout(x, y, desiredState);
        return desiredState;
      }
    }

    console.log(`Using bunker layout in room: ${room.name}`);

    return desiredState;
  }

  private markLayout(x: number, y: number, desiredState: string[][]) {
    for (let yy = y; yy < 50 && yy < y + this.layout.length; yy++) {
      for (let xx = x; xx < 50 && xx < x + this.layout.length; xx++) {
        desiredState[yy][xx] = this.layout[yy - y][xx - x];
      }
    }
  }

  isRoomForLayout(room: Room): boolean {
    for (let y = 3; y < 50; y++) {
      for (let x = 3; x < 50; x++) {
        if (this.isRoomFromPosition(room, x, y)) return true;
      }
    }
    return false;
  }

  private isRoomFromPosition(room: Room, x: number, y: number): boolean {
    for (let yy = y; yy < 50 && yy < y + this.layout.length; yy++) {
      for (let xx = x; xx < 50 && xx < x + this.layout[yy - y].length; xx++) {
        if (this.layout[yy - y][xx - x] === "") continue;
        if (room.controller && room.controller.pos.inRangeTo(x, y, 3)) return false;
        if (room.getTerrain().get(xx, yy) === TERRAIN_MASK_WALL) return false;
      }
    }
    return true;
  }

  // Using bunker layout from: https://wiki.screepspl.us/index.php/File:BunkerExample.png
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
    ];
  }
}
