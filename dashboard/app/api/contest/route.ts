import { NextResponse } from "next/server"
import { ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

const ROOM_NAME = /^[WE]\d{1,3}[NS]\d{1,3}$/

/**
 * Take a remote room from the player who reserves it, or call a contest off (see src/remote/contest.ts). The bot
 * checks the room can be contested and says why not in the snapshot (contestRequest.status).
 *   { room: "W1N2" }                contest it, whatever the aggression and strength
 *   { room: "W1N2", cancel: true }  call the contest there off
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
    await sendCommand({
      path: "contestRequest",
      value: { room, ...(body.cancel === true ? { cancel: true } : {}), requested: Date.now() }
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
