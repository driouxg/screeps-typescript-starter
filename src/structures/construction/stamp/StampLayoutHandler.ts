import distanceTransform from "utils/distanceTransform"
import { floodFill } from "utils/floodFill"
import { buildStringGrid, isBuildablePos } from "utils/gridBuilder"
import IConstructionHandler from "../IConstructionHandler"
import ILayoutHandler from "../ILayoutHandler"
import RoadConstructionHandler from "../road/roadConstructionHandler"

export default class StampLayoutHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[]

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers
  }

  handle(room: Room): string[][] {
    return this.go(room) as string[][]
  }

  isRoomForLayout(room: Room): boolean {
    return this.go(room) !== null
  }

  private go(room: Room) {
    let desiredState = buildStringGrid()
    this.constructionHandlers.forEach(c => (desiredState = c.handle(room, desiredState)))
    let cm = getTerrainCostMatrix(room.getTerrain(), desiredState)

    const controllerPos = room.controller?.pos
    if (!controllerPos) return null

    // Mark Rapid Refill Cluster
    const rapidRefillPos = this.findCenterPos(controllerPos, cm, room, 4)
    if (!rapidRefillPos) return null
    markCm(rapidRefillPos, 2, cm) // Mark fill cluster spots
    markDesiredState(rapidRefillPos, 3, rapidFillCluster(), desiredState)

    // Find anchor spot
    const anchorPos = this.findCenterPos(rapidRefillPos, cm, room, 3)
    if (!anchorPos) return null
    markCm(anchorPos, 1, cm)
    markDesiredState(anchorPos, 2, anchor(), desiredState)

    // Lab locations
    const labPos = this.findCenterPos(rapidRefillPos, cm, room, 3)
    if (!labPos) return null
    markCm(labPos, 2, cm)
    markDesiredState(labPos, 2, labs(), desiredState)

    // // Tower locations
    const towerPos = this.findCenterPos(rapidRefillPos, cm, room, 3)
    if (!towerPos) return null
    markCm(towerPos, 1, cm)
    markDesiredState(towerPos, 1, towers(), desiredState)

    //  Extensions
    for (let i = 0; i < 7; i++) {
      const extPos = this.findCenterPos(rapidRefillPos, cm, room, 3)
      if (!extPos) return null
      markCm(extPos, 1, cm)
      markDesiredState(extPos, 2, extensionPlusStamp(), desiredState)
    }

    return new RoadConstructionHandler().handle(room, desiredState)
  }

  private findCenterPos(
    pointOfInterest: { x: number; y: number },
    cm: CostMatrix,
    room: Room,
    area: number
  ): { x: number; y: number } | null {
    let dt = distanceTransform(cm, room, false)

    if (!pointOfInterest) return null

    let fillClusterOptions: { x: number; y: number }[] = []
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (dt.get(x, y) >= area) {
          fillClusterOptions.push({ x, y })
        }
      }
    }

    if (fillClusterOptions.length <= 0) return null

    const ff = floodFill([{ x: pointOfInterest.x, y: pointOfInterest.y }], cm, true)

    let min = Number.MAX_SAFE_INTEGER
    let centerPos = fillClusterOptions[0]
    for (let cPos of fillClusterOptions) {
      if (min < ff.get(cPos.x, cPos.y)) continue

      min = ff.get(cPos.x, cPos.y)
      centerPos = cPos
    }

    return centerPos
  }
}

function markCm(center: { x: number; y: number }, val: number, cm: CostMatrix) {
  for (let i = center.y - val; i < center.y + val; i++) {
    for (let j = center.x - val; j < center.x + val; j++) {
      cm.set(j, i, TERRAIN_MASK_WALL)
    }
  }
}

function markDesiredState(
  center: { x: number; y: number },
  val: number,
  blueprint: string[][],
  desiredState: string[][]
) {
  for (let i = center.y - val; i <= center.y + val; i++) {
    for (let j = center.x - val; j <= center.x + val; j++) {
      if (!isBuildablePos(j, i)) continue

      desiredState[i][j] = blueprint[i % (center.y - val)][j % (center.x - val)]
    }
  }
}

function extensionPlusStamp(): string[][] {
  return [
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, "", STRUCTURE_EXTENSION, "", STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, "", STRUCTURE_EXTENSION, "", STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD]
  ]
}

function rapidFillCluster(): string[][] {
  return [
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [
      STRUCTURE_ROAD,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_ROAD
    ],
    [STRUCTURE_ROAD, STRUCTURE_SPAWN, "", STRUCTURE_EXTENSION, "", STRUCTURE_SPAWN, STRUCTURE_ROAD],
    [
      STRUCTURE_ROAD,
      STRUCTURE_CONTAINER,
      STRUCTURE_EXTENSION,
      STRUCTURE_LINK,
      STRUCTURE_EXTENSION,
      STRUCTURE_CONTAINER,
      STRUCTURE_ROAD
    ],
    [STRUCTURE_ROAD, STRUCTURE_EXTENSION, "", STRUCTURE_EXTENSION, "", STRUCTURE_EXTENSION, STRUCTURE_ROAD],
    [
      STRUCTURE_ROAD,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_SPAWN,
      STRUCTURE_EXTENSION,
      STRUCTURE_EXTENSION,
      STRUCTURE_ROAD
    ],
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD]
  ]
}

function labs(): string[][] {
  return [
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_ROAD]
  ]
}

function towers(): string[][] {
  return [
    [STRUCTURE_TOWER, STRUCTURE_TOWER, STRUCTURE_TOWER],
    [STRUCTURE_TOWER, STRUCTURE_ROAD, STRUCTURE_TOWER],
    [STRUCTURE_ROAD, STRUCTURE_TOWER, STRUCTURE_ROAD]
  ]
}

function anchor(): string[][] {
  return [
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_FACTORY, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_STORAGE, STRUCTURE_ROAD, STRUCTURE_LINK, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_TERMINAL, STRUCTURE_SPAWN, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD]
  ]
}

/**
 * Create cost matrix and don't allow building bases next to resources/controller
 */
export function getTerrainCostMatrix(terrain: RoomTerrain, desiredState: string[][]) {
  let c = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      c.set(x, y, terrain.get(x, y))

      if (desiredState[y][x] !== "") c.set(x, y, TERRAIN_MASK_WALL)
    }
  }

  return c
}
