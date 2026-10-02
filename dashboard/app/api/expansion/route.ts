import { NextResponse } from "next/server"
import { ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

const ROOM_NAME = /^[WE]\d{1,3}[NS]\d{1,3}$/

/**
 * The player's expansion pick (see src/expansion/expansionPlanner.ts):
 *   { target: "W1N2" }  expand there (the bot checks it can, and says why not in the snapshot)
 *   { cancel: true }    abandon the expansion underway
 *   { clear: true }     withdraw a request the bot hasn't acted on
 */
export async function POST(request: Request) {
  let body: { target?: unknown; cancel?: unknown; clear?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  let value: { target: string } | { cancel: true } | null
  if (body.clear === true) value = null
  else if (body.cancel === true) value = { cancel: true }
  else if (typeof body.target === "string" && ROOM_NAME.test(body.target.trim().toUpperCase()))
    value = { target: body.target.trim().toUpperCase() }
  else return NextResponse.json({ error: "Give a room name like W1N2, or cancel / clear" }, { status: 400 })

  try {
    await sendCommand({ path: "expansionRequest", value })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
