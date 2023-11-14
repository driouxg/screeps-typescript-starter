import { buildStringGrid } from "./GridBuilder"

export default function convert(buildOrder: BuildOrderStep[]): string[][] {
  let desiredState = buildStringGrid()
  if (!buildOrder) return desiredState

  buildOrder.forEach(step => (desiredState[step.y][step.x] = step.structureType))

  return desiredState
}
