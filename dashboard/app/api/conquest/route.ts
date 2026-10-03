import { NextResponse } from "next/server"
import { ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

const ROOM_NAME = /^[WE]\d{1,3}[NS]\d{1,3}$/
const TEMPLATES = ["raid", "duo", "quad"]

/**
 * Approve a conquest of another player's base, or call it off (see src/conquest/conquest.ts). The bot never starts
 * one without this. It checks the room again when it gets the request and says why not in the snapshot
 * (conquestRequest.status).
 *   { room: "W1N2" }                                  approve it, if the bot thinks it can win
 *   { room: "W1N2", force: true }                     approve it even if the bot thinks it can't
 *   { room: "W1N2", template: "quad" }                with that attack squad instead of the one for the home's RCL
 *   { room: "W1N2", cancel: true }                    call it off (the squad comes home)
 */
export async function POST(request: Request) {
  let body: { room?: unknown; cancel?: unknown; force?: unknown; template?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const room = typeof body.room === "string" ? body.room.trim().toUpperCase() : ""
  if (!ROOM_NAME.test(room)) return NextResponse.json({ error: "Give a room name like W1N2" }, { status: 400 })
  const template = typeof body.template === "string" && TEMPLATES.includes(body.template) ? body.template : undefined
  if (body.template !== undefined && body.template !== null && !template)
    return NextResponse.json({ error: `Squad template must be one of ${TEMPLATES.join(", ")}` }, { status: 400 })

  try {
    await sendCommand({
      path: "conquestRequest",
      value:
        body.cancel === true
          ? { room, action: "cancel", requested: Date.now() }
          : {
              room,
              action: "approve",
              ...(body.force === true ? { force: true } : {}),
              ...(template ? { template } : {}),
              requested: Date.now()
            }
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
