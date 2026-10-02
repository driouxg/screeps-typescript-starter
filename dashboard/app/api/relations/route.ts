import { NextResponse } from "next/server"
import { getSnapshot, ScreepsError, sendCommand } from "@/lib/screeps"

export const dynamic = "force-dynamic"

/** Screeps usernames: letters, digits, "_" and "-". Also keeps a name from reaching into other Memory paths. */
const USERNAME = /^[\w-]{1,40}$/

/**
 * Relations with other players (see src/config/relations.ts and src/defence/retaliation.ts):
 *   { forgive: "Name" }          stop treating a player flagged for attacking us as hostile (until they attack again)
 *   { retaliate: "Name" }        send a strike at a hostile player's weak spot, if they have one; one at a time
 *   { cancelRetaliation: true }  call the strike off (the squad comes home), or clear how the last one ended
 */
export async function POST(request: Request) {
  let body: { forgive?: unknown; retaliate?: unknown; cancelRetaliation?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  try {
    const snapshot = await getSnapshot()
    const { hostilePlayers, enemies } = snapshot.relations

    if (typeof body.forgive === "string") {
      const name = body.forgive
      if (!USERNAME.test(name) || hostilePlayers[name] === undefined)
        return NextResponse.json({ error: `${name} isn't flagged for attacking us` }, { status: 400 })
      await sendCommand({ path: `hostilePlayers.${name}`, value: null })
      return NextResponse.json({ ok: true })
    }

    if (typeof body.retaliate === "string") {
      const name = body.retaliate
      if (!USERNAME.test(name) || (hostilePlayers[name] === undefined && !enemies.includes(name)))
        return NextResponse.json({ error: `${name} isn't hostile: only players who attacked us, or declared enemies` }, { status: 400 })
      const current = snapshot.retaliation
      if (current && current.state !== "over")
        return NextResponse.json({ error: `A strike on ${current.player} is already underway` }, { status: 409 })
      await sendCommand({ path: "retaliation", value: { player: name, requested: Date.now() } })
      return NextResponse.json({ ok: true })
    }

    if (body.cancelRetaliation === true) {
      await sendCommand({ path: "retaliation", value: null })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Expected forgive, retaliate or cancelRetaliation" }, { status: 400 })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
