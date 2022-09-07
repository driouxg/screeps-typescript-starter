import distanceTransform from "utils/distanceTransform"
import { floodFill } from "utils/floodFill"
import { buildStringGrid, isBuildablePos } from "utils/gridBuilder"
import IConstructionHandler from "../IConstructionHandler"
import ILayoutHandler from "../ILayoutHandler"
import RoadConstructionHandler from "../road/roadConstructionHandler"
import minCut from "../../../utils/minCut"

/**
 * Goal: Mark layout in desiredState and mark rampart locations using MinCut
 */
export default class StampLayoutHandler implements ILayoutHandler {
  private constructionHandlers: IConstructionHandler[]
  private protectedAreas: { x1: number; y1: number; x2: number; y2: number }[] = []

  public constructor(constructionHandlers: IConstructionHandler[]) {
    this.constructionHandlers = constructionHandlers
  }

  handle(room: Room): BuildOrderStep[] {
    let buildOrder = this.go(room) as BuildOrderStep[]
    buildOrder = buildOrder.concat(
      minCut.test(room.name, this.protectedAreas).map(p => ({ ...p, structureType: STRUCTURE_RAMPART }))
    )

    return buildOrder
  }

  isRoomForLayout(room: Room): boolean {
    return this.go(room) !== null
  }

  private go(room: Room): BuildOrderStep[] | null {
    let buildOrder: BuildOrderStep[] = []
    let cm = getTerrainCostMatrix(room.getTerrain(), buildOrder)

    const controllerPos = room.controller?.pos
    if (!controllerPos) return null

    // Mark Rapid Refill Cluster
    // If spawn already in room, calc center point
    const mySpawns = room.find(FIND_MY_SPAWNS)
    let rapidRefillPos = null
    if (0 < mySpawns.length) rapidRefillPos = new RoomPosition(mySpawns[0].pos.x + 2, mySpawns[0].pos.y + 1, room.name)
    else rapidRefillPos = this.findCenterPos(controllerPos, cm, room, 4)

    if (!rapidRefillPos) return null
    markCm(rapidRefillPos, 2, cm) // Mark fill cluster spots
    buildOrder = buildOrder.concat(rapidFillCluster(rapidRefillPos))
    this.markProtectedArea(rapidRefillPos, 3)

    // Find anchor spot
    // const anchorPos = this.findCenterPos(controllerPos, cm, room, 3)
    // if (!anchorPos) return null
    // markCm(anchorPos, 1, cm)
    // this.markProtectedArea(anchorPos, 2)

    // // Lab locations
    // const labPos = this.findCenterPos(controllerPos, cm, room, 3)
    // if (!labPos) return null
    // markCm(labPos, 2, cm)
    // this.markProtectedArea(labPos, 3)

    // // // Tower locations
    // const towerPos = this.findCenterPos(controllerPos, cm, room, 3)
    // if (!towerPos) return null
    // markCm(towerPos, 1, cm)
    // this.markProtectedArea(towerPos, 2)

    //  Extensions
    for (let i = 0; i < 7; i++) {
      const extPos = this.findCenterPos(controllerPos, cm, room, 3)
      if (!extPos) return null
      markCm(extPos, 2, cm)
      buildOrder = buildOrder.concat(extensionPlusStamp(extPos))
      this.markProtectedArea(extPos, 2)
    }

    // return new RoadConstructionHandler().handle(room, desiredState)

    this.constructionHandlers.forEach(c => (buildOrder = c.handle(room, buildOrder)))
    return buildOrder
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

  private markProtectedArea(center: { x: number; y: number }, radius: number) {
    this.protectedAreas.push({
      x1: center.x - radius,
      y1: center.y - radius,
      x2: center.x + radius,
      y2: center.y + radius
    })
  }
}

function markCm(center: { x: number; y: number }, val: number, cm: CostMatrix) {
  for (let i = center.y - val; i < center.y + val; i++) {
    for (let j = center.x - val; j < center.x + val; j++) {
      cm.set(j, i, TERRAIN_MASK_WALL)
    }
  }
}

function extensionPlusStamp(centerPos: { x: number; y: number }): BuildOrderStep[] {
  const { x: xx, y: yy } = centerPos

  return [
    { x: xx, y: yy, structureType: STRUCTURE_EXTENSION },
    { x: xx - 1, y: yy, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy + 1, structureType: STRUCTURE_EXTENSION },
    { x: xx + 1, y: yy, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy - 1, structureType: STRUCTURE_EXTENSION },
    { x: xx - 2, y: yy, structureType: STRUCTURE_ROAD },
    { x: xx - 1, y: yy + 1, structureType: STRUCTURE_ROAD },
    { x: xx, y: yy + 2, structureType: STRUCTURE_ROAD },
    { x: xx + 1, y: yy + 1, structureType: STRUCTURE_ROAD },
    { x: xx + 2, y: yy, structureType: STRUCTURE_ROAD },
    { x: xx + 1, y: yy - 1, structureType: STRUCTURE_ROAD },
    { x: xx, y: yy - 2, structureType: STRUCTURE_ROAD },
    { x: xx - 1, y: yy - 1, structureType: STRUCTURE_ROAD }
  ]
}

function rapidFillCluster(centerPos: { x: number; y: number }): BuildOrderStep[] {
  const { x: xx, y: yy } = centerPos

  return [
    { x: xx - 2, y: yy - 1, structureType: STRUCTURE_SPAWN },
    { x: xx - 2, y: yy, structureType: STRUCTURE_CONTAINER },
    { x: xx - 2, y: yy - 2, structureType: STRUCTURE_EXTENSION },
    { x: xx - 1, y: yy - 2, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy - 2, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy - 1, structureType: STRUCTURE_EXTENSION },
    { x: xx - 1, y: yy, structureType: STRUCTURE_EXTENSION },
    { x: xx + 1, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx + 2, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx + 2, y: yy + 1, structureType: STRUCTURE_SPAWN },
    { x: xx + 2, y: yy, structureType: STRUCTURE_CONTAINER },
    { x: xx + 1, y: yy, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy, structureType: STRUCTURE_LINK },
    { x: xx - 2, y: yy + 1, structureType: STRUCTURE_EXTENSION },
    { x: xx - 2, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx - 1, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy + 2, structureType: STRUCTURE_SPAWN },
    { x: xx + 1, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx + 2, y: yy + 2, structureType: STRUCTURE_EXTENSION },
    { x: xx + 2, y: yy + 1, structureType: STRUCTURE_EXTENSION },
    { x: xx, y: yy + 1, structureType: STRUCTURE_EXTENSION },
    { x: xx - 3, y: yy - 2, structureType: STRUCTURE_ROAD },
    { x: xx - 3, y: yy - 1, structureType: STRUCTURE_ROAD },
    { x: xx - 3, y: yy, structureType: STRUCTURE_ROAD },
    { x: xx - 3, y: yy + 1, structureType: STRUCTURE_ROAD },
    { x: xx - 3, y: yy + 2, structureType: STRUCTURE_ROAD },
    { x: xx - 2, y: yy + 3, structureType: STRUCTURE_ROAD },
    { x: xx - 1, y: yy + 3, structureType: STRUCTURE_ROAD },
    { x: xx, y: yy + 3, structureType: STRUCTURE_ROAD },
    { x: xx + 1, y: yy + 3, structureType: STRUCTURE_ROAD },
    { x: xx + 2, y: yy + 3, structureType: STRUCTURE_ROAD },
    { x: xx + 3, y: yy + 2, structureType: STRUCTURE_ROAD },
    { x: xx + 3, y: yy + 1, structureType: STRUCTURE_ROAD },
    { x: xx + 3, y: yy, structureType: STRUCTURE_ROAD },
    { x: xx + 3, y: yy - 1, structureType: STRUCTURE_ROAD },
    { x: xx + 3, y: yy - 2, structureType: STRUCTURE_ROAD },
    { x: xx + 2, y: yy - 3, structureType: STRUCTURE_ROAD },
    { x: xx + 1, y: yy - 3, structureType: STRUCTURE_ROAD },
    { x: xx, y: yy - 3, structureType: STRUCTURE_ROAD },
    { x: xx - 1, y: yy - 3, structureType: STRUCTURE_ROAD },
    { x: xx - 2, y: yy - 3, structureType: STRUCTURE_ROAD }
  ]
}

function labs(): string[][] {
  return [
    ["", STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB],
    [STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB],
    ["", STRUCTURE_ROAD, STRUCTURE_LAB, STRUCTURE_LAB, ""]
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
 * Create cost matrix and don't allow building bases next to resources/controller or existing marked structures.
 */
export function getTerrainCostMatrix(terrain: RoomTerrain, buildOrder: BuildOrderStep[]) {
  let c = new PathFinder.CostMatrix()
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      c.set(x, y, terrain.get(x, y))
    }
  }

  for (let step of buildOrder) {
    c.set(step.x, step.y, TERRAIN_MASK_WALL)
  }

  return c
}
