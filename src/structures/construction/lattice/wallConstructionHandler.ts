import { buildBooleanGrid, isBuildablePos, isEdge, isInBounds, isWall } from "utils/gridBuilder"
import IConstructionHandler from "../IConstructionHandler"
import Queue from "../../../utils/queue"
import { dirs } from "utils/directions"
import convert from "../util/buildOrderToDesiredState"

export default class WallConstructionHandler implements IConstructionHandler {
  public handle(room: Room, buildOrder: BuildOrderStep[]): BuildOrderStep[] {
    const visited: boolean[][] = buildBooleanGrid()
    const marked: boolean[][] = buildBooleanGrid()
    const desiredState = convert(buildOrder)

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (!isEdge(x, y) || room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) continue
        buildOrder = this.bfs(buildOrder, desiredState, visited, marked, x, y, room)
      }
    }

    return buildOrder
  }

  private bfs(
    buildOrder: BuildOrderStep[],
    desiredState: string[][],
    visited: boolean[][],
    marked: boolean[][],
    x: number,
    y: number,
    room: Room
  ): BuildOrderStep[] {
    const q: Queue<number[]> = new Queue<number[]>()
    q.add([x, y])

    while (!q.isEmpty()) {
      const size: number = q.size()
      for (let i = 0; i < size; i++) {
        const pos: number[] | undefined = q.remove()

        if (!pos) continue

        if (!isWall(pos[0], pos[1], room.name) && isBuildablePos(pos[0], pos[1])) {
          if (!marked[pos[1]][pos[0]]) {
            marked[pos[1]][pos[0]] = true
            const structureType = desiredState[pos[1]][pos[0]] === STRUCTURE_ROAD ? STRUCTURE_RAMPART : STRUCTURE_WALL
            buildOrder = buildOrder.concat({ x: pos[0], y: pos[1], structureType })
          }
          continue
        }

        visited[pos[1]][pos[0]] = true

        for (const dir of dirs()) {
          const dx: number = pos[0] + dir[0]
          const dy: number = pos[1] + dir[1]

          if (!isInBounds(dx, dy) || visited[dy][dx] || room.getTerrain().get(dx, dy) === TERRAIN_MASK_WALL) continue
          q.add([dx, dy])
          visited[dy][dx] = true
        }
      }
    }

    return buildOrder
  }
}
