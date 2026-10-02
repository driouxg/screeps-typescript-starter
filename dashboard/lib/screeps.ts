import "server-only"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { ControlsSnapshot, DashboardSnapshot } from "@bot/snapshot"
import { DASHBOARD_SEGMENT } from "@bot/snapshot"

/**
 * Server-side access to the bot: reads its snapshot (memory segment DASHBOARD_SEGMENT, written by
 * src/dashboard/report.ts) and writes Memory.controls (read by src/config/controls.ts), through the game's web API.
 * Configured from the environment (see .env.example); credentials never reach the browser.
 *
 * - Official server: SCREEPS_URL + SCREEPS_TOKEN (+ SCREEPS_SHARD).
 * - Private server with screepsmod-auth: SCREEPS_URL + SCREEPS_USERNAME + SCREEPS_PASSWORD (signs in for a token).
 * - No server: SCREEPS_SNAPSHOT_FILE, a snapshot JSON file; controls are kept in .mock-controls.json.
 */

export type Source = "file" | "server"

export class ScreepsError extends Error {
  public constructor(message: string, public status = 502) {
    super(message)
  }
}

const env = (name: string) => (process.env[name] ?? "").trim()

export function source(): Source {
  return env("SCREEPS_SNAPSHOT_FILE") ? "file" : "server"
}

export async function getSnapshot(): Promise<DashboardSnapshot> {
  if (source() === "file") return readSnapshotFile()

  const shard = env("SCREEPS_SHARD")
  const query = new URLSearchParams({ segment: String(DASHBOARD_SEGMENT), ...(shard ? { shard } : {}) })
  const body = await call<{ ok: number; data: string | null }>(`/api/user/memory-segment?${query}`)
  if (!body.data) throw new ScreepsError(`Segment ${DASHBOARD_SEGMENT} is empty: is the bot running the dashboard report?`, 404)
  return JSON.parse(body.data) as DashboardSnapshot
}

/** Set Memory.controls: the whole object, so the bot never sees a half-written one. */
export async function setControls(controls: ControlsSnapshot): Promise<void> {
  if (source() === "file") {
    await fs.writeFile(mockControlsPath(), JSON.stringify(controls, null, 2))
    return
  }
  const shard = env("SCREEPS_SHARD")
  await call("/api/user/memory", {
    method: "POST",
    body: JSON.stringify({ path: "controls", value: controls, ...(shard ? { shard } : {}) })
  })
}

// --- Snapshot file (development without a server) ---

function mockControlsPath(): string {
  return path.join(process.cwd(), ".mock-controls.json")
}

async function readSnapshotFile(): Promise<DashboardSnapshot> {
  const file = path.resolve(process.cwd(), env("SCREEPS_SNAPSHOT_FILE"))
  let snapshot: DashboardSnapshot
  try {
    snapshot = JSON.parse(await fs.readFile(file, "utf8")) as DashboardSnapshot
  } catch (e) {
    throw new ScreepsError(`Can't read SCREEPS_SNAPSHOT_FILE ${file}: ${(e as Error).message}`, 500)
  }
  // Controls changed from the dashboard show up as if the bot had picked them up.
  try {
    snapshot.controls = { ...snapshot.controls, ...JSON.parse(await fs.readFile(mockControlsPath(), "utf8")) }
  } catch {
    // No changes yet.
  }
  return snapshot
}

// --- Web API ---

let token: string | null = null

async function call<T = unknown>(endpoint: string, init: RequestInit = {}, retried = false): Promise<T> {
  const url = env("SCREEPS_URL").replace(/\/$/, "")
  if (!url) throw new ScreepsError("SCREEPS_URL is not set (see .env.example)", 500)

  const response = await fetch(url + endpoint, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(await authHeaders(url)), ...(init.headers ?? {}) }
  })
  // Private servers hand out a fresh token with each response.
  const fresh = response.headers.get("x-token")
  if (fresh && !env("SCREEPS_TOKEN")) token = fresh

  if (response.status === 401 && !retried && !env("SCREEPS_TOKEN")) {
    token = null
    return call<T>(endpoint, init, true)
  }
  if (response.status === 429) throw new ScreepsError("Rate limited by the server; slow down the refresh", 429)
  if (!response.ok) throw new ScreepsError(`${init.method ?? "GET"} ${endpoint}: HTTP ${response.status}`, response.status)

  const body = (await response.json()) as T & { ok?: number; error?: string }
  if (body.error || body.ok !== 1) throw new ScreepsError(`${endpoint}: ${body.error ?? "request failed"}`)
  return body
}

async function authHeaders(url: string): Promise<Record<string, string>> {
  const fixed = env("SCREEPS_TOKEN")
  if (fixed) return { "X-Token": fixed, "X-Username": fixed }

  if (!token) {
    const email = env("SCREEPS_USERNAME")
    const password = env("SCREEPS_PASSWORD")
    if (!email || !password)
      throw new ScreepsError("Set SCREEPS_TOKEN, or SCREEPS_USERNAME and SCREEPS_PASSWORD (see .env.example)", 500)
    const response = await fetch(`${url}/api/auth/signin`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    const body = (await response.json().catch(() => ({}))) as { ok?: number; token?: string; error?: string }
    if (!response.ok || !body.token) throw new ScreepsError(`Sign-in failed: ${body.error ?? `HTTP ${response.status}`}`, 401)
    token = body.token
  }
  return { "X-Token": token, "X-Username": token }
}
