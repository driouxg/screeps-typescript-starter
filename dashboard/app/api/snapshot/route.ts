import { NextResponse } from "next/server"
import { getSnapshot, ScreepsError, source } from "@/lib/screeps"

export const dynamic = "force-dynamic"

/** The bot's latest snapshot, plus where it came from. */
export async function GET() {
  try {
    return NextResponse.json({ source: source(), snapshot: await getSnapshot() })
  } catch (e) {
    const status = e instanceof ScreepsError ? e.status : 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }
}
