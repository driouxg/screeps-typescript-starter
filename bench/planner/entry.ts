// Entry point for the layout test (bench/layout-test.js): the real base planner, bundled on its own.
import { planLayout } from "composer/constructionComposer"

export function plan(room: Room): BuildOrderStep[] {
  return planLayout(room)
}
