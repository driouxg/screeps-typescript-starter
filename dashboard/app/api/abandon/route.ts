import { NextResponse } from "next/server"
import { getSnapshot, ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

/**
 * Tear down one of our bases (see src/expansion/abandonBase.ts): its creeps, structures and controller are all given
 * up, which can't be undone.
 *   { room: "W1N2", confirm: "W1N2" }  abandon it (the room name typed again, as a guard against misclicks)
 *   { room: "W1N2", cancel: true }     withdraw the request, if the bot hasn't started on it
 */
export async function POST(request: Request) {
  let body: { room?: unknown; confirm?: unknown; cancel?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const room = typeof body.room === "string" ? body.room : ""

  try {
    const snapshot = await getSnapshot()
    if (body.cancel === true) {
      if (!snapshot.abandoning?.some(a => a.room === room))
        return NextResponse.json({ error: `${room} isn't being abandoned` }, { status: 400 })
      await sendCommand({ path: `abandonRooms.${room}`, value: null })
      return NextResponse.json({ ok: true })
    }

    if (!snapshot.rooms.some(r => r.name === room))
      return NextResponse.json({ error: `${room || "That"} isn't one of our rooms` }, { status: 400 })
    if (snapshot.rooms.length <= 1)
      return NextResponse.json({ error: "It's our only room: abandoning it would end the game" }, { status: 400 })
    if (body.confirm !== room)
      return NextResponse.json({ error: `Type ${room} to confirm` }, { status: 400 })

    await sendCommand({ path: `abandonRooms.${room}`, value: { requested: Date.now() } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
