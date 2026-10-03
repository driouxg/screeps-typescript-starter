import "server-only"
import { promises as fs } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"
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

/**
 * Requests the bot acts on: the player's expansion pick and bases to tear down (see src/expansion), which rooms
 * show their build plan and highways in the game (see constructionSiteVisualizer.ts and remote/highwayVisualizer.ts),
 * players forgiven, a strike on one (see src/defence/retaliation.ts), and conquests approved or called off (see
 * src/conquest/conquest.ts).
 */
export type Command =
  | { path: "expansionRequest"; value: { target: string } | { cancel: true } | null }
  | { path: `abandonRooms.${string}`; value: { requested: number } | null }
  | { path: `buildPlanOverlay.${string}` | `highwayOverlay.${string}`; value: boolean }
  | { path: `hostilePlayers.${string}`; value: null }
  | { path: `scoutRequests.${string}`; value: { requested: number } | null }
  | { path: "contestRequest"; value: { room: string; cancel?: boolean; requested: number } | null }
  | { path: "retaliation"; value: { player: string; requested: number } | null }
  | {
      path: "conquestRequest"
      value: {
        room: string
        action: "approve" | "cancel"
        force?: boolean
        template?: string
        requested: number
      } | null
    }

/**
 * Write one command into the bot's Memory. A dotted path ("buildPlanOverlay.W1N2") sets just that key of its parent
 * object: the server writes `Memory.<path> = value`, which fails while the parent doesn't exist, so the parent is
 * read, changed and written back whole (a null value removes the key).
 */
export async function sendCommand(command: Command): Promise<void> {
  if (source() === "file") {
    const commands = await readMockCommands()
    commands[command.path] = command.value
    await fs.writeFile(mockCommandsPath(), JSON.stringify(commands, null, 2))
    return
  }

  const dot = command.path.indexOf(".")
  if (dot < 0) return writeMemory(command.path, command.value)
  const parentPath = command.path.slice(0, dot)
  const key = command.path.slice(dot + 1)
  const current = await readMemory(parentPath)
  const parent: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {}
  if (command.value === null) delete parent[key]
  else parent[key] = command.value
  await writeMemory(parentPath, parent)
}

async function writeMemory(memoryPath: string, value: unknown): Promise<void> {
  const shard = env("SCREEPS_SHARD")
  await call("/api/user/memory", {
    method: "POST",
    body: JSON.stringify({ path: memoryPath, value, ...(shard ? { shard } : {}) })
  })
}

/** Memory at `memoryPath`, or undefined if it isn't set. The server sends it gzipped and base64 encoded ("gz:..."). */
async function readMemory(memoryPath: string): Promise<unknown> {
  const shard = env("SCREEPS_SHARD")
  const query = new URLSearchParams({ path: memoryPath, ...(shard ? { shard } : {}) })
  const body = await call<{ data?: string }>(`/api/user/memory?${query}`)
  if (!body.data) return undefined
  const json = body.data.startsWith("gz:")
    ? gunzipSync(Buffer.from(body.data.slice(3), "base64")).toString("utf8")
    : body.data
  return json === "undefined" ? undefined : JSON.parse(json)
}

// --- Snapshot file (development without a server) ---

function mockControlsPath(): string {
  return path.join(process.cwd(), ".mock-controls.json")
}

function mockCommandsPath(): string {
  return path.join(process.cwd(), ".mock-commands.json")
}

async function readMockCommands(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(mockCommandsPath(), "utf8")) as Record<string, unknown>
  } catch {
    return {}
  }
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
  // Commands show up as requests the bot hasn't acted on yet.
  const commands = await readMockCommands()
  if ("expansionRequest" in commands)
    snapshot.expansionRequest = commands.expansionRequest as DashboardSnapshot["expansionRequest"]
  const abandoning = Object.entries(commands).filter(([key, value]) => key.startsWith("abandonRooms.") && value)
  if (abandoning.length)
    snapshot.abandoning = abandoning.map(([key]) => ({ room: key.slice("abandonRooms.".length), status: "requested" }))
  for (const [key, value] of Object.entries(commands))
    if (key.startsWith("hostilePlayers.") && value === null)
      delete snapshot.relations.hostilePlayers[key.slice("hostilePlayers.".length)]
  for (const [key, value] of Object.entries(commands)) {
    if (!key.startsWith("scoutRequests.")) continue
    const room = key.slice("scoutRequests.".length)
    const others = (snapshot.scoutRequests ?? []).filter(r => r.room !== room)
    snapshot.scoutRequests = value ? others.concat({ room, status: "waiting for the bot", done: false }) : others
  }
  if ("contestRequest" in commands) {
    const r = commands.contestRequest as { room: string; cancel?: boolean } | null
    snapshot.contestRequest = r ? { room: r.room, cancel: r.cancel, status: "waiting for the bot" } : null
  }
  if ("conquestRequest" in commands) {
    const r = commands.conquestRequest as { room: string; action: string } | null
    snapshot.conquestRequest = r ? { room: r.room, action: r.action, status: "waiting for the bot" } : null
  }
  if ("retaliation" in commands) {
    const r = commands.retaliation as { player: string } | null
    snapshot.retaliation = r ? { player: r.player, state: "planning", status: "requested", squad: 0 } : null
  }
  for (const room of snapshot.rooms) {
    const overlay = commands[`buildPlanOverlay.${room.name}`]
    if (typeof overlay === "boolean") room.buildPlanOverlay = overlay
    const highway = commands[`highwayOverlay.${room.name}`]
    if (typeof highway === "boolean") room.highwayOverlay = highway
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
