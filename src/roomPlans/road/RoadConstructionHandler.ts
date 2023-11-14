import { isBuildablePos, isInBounds, isWall } from "roomPlans/utils/GridBuilder"
import IConstructionHandler from "../IConstructionHandler"

export default class RoadConstructionHandler implements IConstructionHandler {
  public handle(room: Room, desiredState: string[][]): string[][] {
    if (!(room.controller && room.controller.my)) return desiredState

    const controller: StructureController = room.controller

    this.buildRoadsBetweenControllerAndContainers(controller, desiredState)
    this.buildRoadsBetweenControllerAndExits(controller, desiredState)
    // build road to minerals
    this.buildRoadsBetweenControllerAndSpawns(controller, desiredState)
    this.buildRoadsBetweenContainersAndSpawns(controller, desiredState)

    return desiredState
  }

  private buildRoadsBetweenControllerAndContainers(controller: StructureController, desiredState: string[][]): void {
    this.markRoadsBetweenPositions(
      [controller.pos],
      this.plannedStructurePositions(controller, desiredState, STRUCTURE_CONTAINER),
      desiredState
    )
  }

  private buildRoadsBetweenControllerAndSpawns(controller: StructureController, desiredState: string[][]): void {
    const spawns = this.plannedStructurePositions(controller, desiredState, STRUCTURE_SPAWN)

    this.markRoadsBetweenPositions([controller.pos], spawns, desiredState)
  }

  private plannedStructurePositions(
    controller: StructureController,
    desiredState: string[][],
    structure: StructureConstant
  ): RoomPosition[] {
    const structures = []

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (desiredState[y][x] === structure) structures.push(new RoomPosition(x, y, controller.room.name))
      }
    }
    return structures
  }

  private buildRoadsBetweenContainersAndSpawns(controller: StructureController, desiredState: string[][]): void {
    const spawnPositions = this.plannedStructurePositions(controller, desiredState, STRUCTURE_SPAWN)

    this.markRoadsBetweenPositions(
      this.plannedStructurePositions(controller, desiredState, STRUCTURE_CONTAINER),
      spawnPositions,
      desiredState
    )
  }

  private markRoadsBetweenPositions(
    from: RoomPosition[],
    to: RoomPosition[],
    desiredState: string[][],
    duplicateRoads = false
  ): void {
    for (const fromPos of from) {
      for (const toPos of to) {
        const path: PathStep[] = fromPos.findPathTo(toPos)

        for (let i = 0; i < path.length - 1; i++) {
          const step = path[i]
          if (desiredState[step.y][step.x] === STRUCTURE_ROAD && !duplicateRoads) break
          if (desiredState[step.y][step.x] !== "") continue
          if (isBuildablePos(step.x, step.y)) desiredState[step.y][step.x] = STRUCTURE_ROAD
        }
      }
    }
  }

  private buildRoadsBetweenControllerAndExits(controller: StructureController, desiredState: string[][]): void {
    const exits: RoomPosition[] = []

    const leftExit = this.findExit(controller, desiredState, "LEFT")
    // if (leftExit) exits.push([leftExit[0], leftExit[1]])
    if (leftExit) exits.push(new RoomPosition(leftExit[0], leftExit[1], controller.room.name))

    const topExit = this.findExit(controller, desiredState, "TOP")
    // if (topExit) exits.push([topExit[0], topExit[1]])
    if (topExit) exits.push(new RoomPosition(topExit[0], topExit[1], controller.room.name))

    const rightExit = this.findExit(controller, desiredState, "RIGHT")
    // if (rightExit) exits.push([rightExit[0], rightExit[1]])
    if (rightExit) exits.push(new RoomPosition(rightExit[0], rightExit[1], controller.room.name))

    const bottomExit = this.findExit(controller, desiredState, "BOTTOM")
    // if (bottomExit) exits.push([bottomExit[0], bottomExit[1]])
    if (bottomExit) exits.push(new RoomPosition(bottomExit[0], bottomExit[1], controller.room.name))

    for (const exit of exits) {
      const path: PathStep[] = controller.pos.findPathTo(exit)

      this.markRoadsBetweenPositions([controller.pos], exits, desiredState, true)
    }
  }

  private findExit(controller: StructureController, desiredState: string[][], exit: string): number[] | undefined {
    const positions: { [key: string]: { [key: string]: number } } = {
      TOP: { x: 0, y: 0 },
      LEFT: { x: 0, y: 0 },
      RIGHT: { x: 49, y: 0 },
      BOTTOM: { x: 0, y: 49 }
    }
    let x = positions[exit].x
    let y = positions[exit].y
    const horizontal: boolean = exit === "TOP" || exit === "BOTTOM"
    while (y < desiredState.length && x < desiredState[y].length && isWall(x, y, controller.room.name)) {
      if (horizontal) x++
      else y++
    }

    if (!isWall(x, y, controller.room.name) && isInBounds(x, y)) return [x, y]
    else return undefined
  }
}
