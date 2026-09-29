import { buildStringGrid } from "utils/gridBuilder"

export default function convert(buildOrder: BuildOrderStep[]): string[][] {
  let desiredState = buildStringGrid()
  if (!buildOrder) return desiredState

  buildOrder.forEach(step => (desiredState[step.y][step.x] = step.structureType))

  return desiredState
}

/**
 * Append every cell of desiredState that differs from buildOrder as a new build order step.
 */
export function appendChanges(buildOrder: BuildOrderStep[], desiredState: string[][]): BuildOrderStep[] {
  const original = convert(buildOrder)
  const steps: BuildOrderStep[] = []

  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      if (desiredState[y][x] === original[y][x] || desiredState[y][x] === "") continue
      steps.push({ x, y, structureType: desiredState[y][x] as BuildableStructureConstant })
    }
  }

  return buildOrder.concat(steps)
}
