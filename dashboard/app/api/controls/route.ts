import { NextResponse } from "next/server"
import type { AggressionLevel, ControlsSnapshot } from "@bot/snapshot"
import { getSnapshot, ScreepsError, setControls } from "@/lib/screeps"

export const dynamic = "force-dynamic"

const LEVELS: AggressionLevel[] = ["passive", "defensive", "aggressive"]

/**
 * Change one or more controls. The rest are taken from the bot's latest snapshot, and the whole object is written to
 * Memory.controls (the bot validates it again, see src/config/controls.ts).
 */
export async function POST(request: Request) {
  let change: Partial<ControlsSnapshot>
  try {
    change = (await request.json()) as Partial<ControlsSnapshot>
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  if (change.aggression !== undefined && !LEVELS.includes(change.aggression))
    return NextResponse.json({ error: `aggression must be one of ${LEVELS.join(", ")}` }, { status: 400 })
  for (const key of ["remoteMining", "expansion"] as const)
    if (change[key] !== undefined && typeof change[key] !== "boolean")
      return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 })

  try {
    const current = (await getSnapshot()).controls
    const controls: ControlsSnapshot = {
      aggression: change.aggression ?? current.aggression,
      remoteMining: change.remoteMining ?? current.remoteMining,
      expansion: change.expansion ?? current.expansion
    }
    await setControls(controls)
    return NextResponse.json({ controls })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
