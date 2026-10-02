import { NextResponse } from "next/server"
import { getSnapshot, ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

/**
 * Show or hide a room's build plan in the game (Memory.buildPlanOverlay, see
 * src/structures/construction/util/constructionSiteVisualizer.ts): { room: "W1N2", show: true }.
 */
export async function POST(request: Request) {
  let body: { room?: unknown; show?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  if (typeof body.show !== "boolean") return NextResponse.json({ error: "show must be true or false" }, { status: 400 })

  try {
    const room = typeof body.room === "string" ? body.room : ""
    if (!(await getSnapshot()).rooms.some(r => r.name === room))
      return NextResponse.json({ error: `${room || "That"} isn't one of our rooms` }, { status: 400 })
    await sendCommand({ path: `buildPlanOverlay.${room}`, value: body.show })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
