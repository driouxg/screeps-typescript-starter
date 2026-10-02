import { NextResponse } from "next/server"
import { getSnapshot, ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

const ROOM_NAME = /^[WE]\d{1,3}[NS]\d{1,3}$/
/** Requests at a time, so a stuck form can't flood the bot's memory. */
const MAX_REQUESTS = 10

/**
 * Ask for a room to be scouted (see src/expansion/scoutRequests.ts): the bot sends a scout from the base closest to it.
 *   { room: "W1N2" }          scout it
 *   { room: "W1N2", cancel }  withdraw the request (or clear one that's finished)
 */
export async function POST(request: Request) {
  let body: { room?: unknown; cancel?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const room = typeof body.room === "string" ? body.room.trim().toUpperCase() : ""
  if (!ROOM_NAME.test(room)) return NextResponse.json({ error: "Give a room name like W1N2" }, { status: 400 })

  try {
    if (body.cancel === true) {
      await sendCommand({ path: `scoutRequests.${room}`, value: null })
      return NextResponse.json({ ok: true })
    }
    const open = ((await getSnapshot()).scoutRequests ?? []).filter(r => !r.done)
    if (open.some(r => r.room === room)) return NextResponse.json({ error: `${room} is already being scouted` }, { status: 409 })
    if (MAX_REQUESTS <= open.length)
      return NextResponse.json({ error: `${MAX_REQUESTS} rooms are already waiting for a scout` }, { status: 409 })
    await sendCommand({ path: `scoutRequests.${room}`, value: { requested: Date.now() } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
