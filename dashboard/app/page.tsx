"use client"

import { useCallback, useEffect, useState } from "react"
import type { AggressionLevel, ControlsSnapshot, DashboardSnapshot } from "@bot/snapshot"
import { ControlsPanel } from "@/components/ControlsPanel"
import { RoomPanel } from "@/components/RoomPanel"
import { ExpansionPanel } from "@/components/ExpansionPanel"
import { AbandonBase } from "@/components/AbandonBase"
import { EnemyPanel } from "@/components/EnemyPanel"
import { ScoutPanel } from "@/components/ScoutPanel"
import { ContestSection } from "@/components/ContestSection"
import { Bar, Icon, Stat } from "@/components/ui"
import {
  CpuPanel,
  HighwaysPanel,
  HostilesPanel,
  RelationsPanel,
  RemotesPanel,
  ThreatsPanel
} from "@/components/Panels"

const REFRESH_SECONDS = Number(process.env.NEXT_PUBLIC_REFRESH_SECONDS) || 15

/** In-game overlays a room can switch on (see /api/overlay). */
const OVERLAYS = [
  { kind: "buildPlan", field: "buildPlanOverlay", label: "Show build plan in game" },
  { kind: "highway", field: "highwayOverlay", label: "Show highway plan in game (roads to remotes)" }
] as const

interface Loaded {
  source: "file" | "server"
  snapshot: DashboardSnapshot
}

export default function Dashboard() {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<Partial<ControlsSnapshot> | null>(null)
  /** Overlays switched from here that the bot hasn't reported yet, by "kind:room". */
  const [overlayPending, setOverlayPending] = useState<Record<string, boolean>>({})
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" })
      // Session expired: back to the login page, then here again.
      if (response.status === 401) {
        window.location.assign("/login")
        return
      }
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      setData(body as Loaded)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
    const refresh = setInterval(load, REFRESH_SECONDS * 1000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(refresh)
      clearInterval(clock)
    }
  }, [load])

  const change = async (update: Partial<ControlsSnapshot>) => {
    setSaving(true)
    try {
      const response = await fetch("/api/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update)
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      // The bot reports the change with its next snapshot; until then, show what was asked for.
      setPending(p => ({ ...p, ...update }))
      setError(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Send a request the bot acts on (expansion pick, abandoning a base); it reports back in a later snapshot. */
  const command = async (endpoint: string, body: object): Promise<boolean> => {
    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
      setError(null)
      await load()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const s = data?.snapshot
  // A pending change is settled once the bot's snapshot reports the same values.
  useEffect(() => {
    if (!s || !pending) return
    const settled = (Object.keys(pending) as (keyof ControlsSnapshot)[]).every(k => s.controls[k] === pending[k])
    if (settled) setPending(null)
  }, [s, pending])

  // An overlay switch is settled once the bot's snapshot reports it.
  useEffect(() => {
    if (!s) return
    setOverlayPending(p => {
      const left = Object.fromEntries(
        Object.entries(p).filter(([id, show]) => {
          const [kind, room] = id.split(":")
          const field = OVERLAYS.find(o => o.kind === kind)!.field
          return s.rooms.find(r => r.name === room)?.[field] !== show
        })
      )
      return Object.keys(left).length === Object.keys(p).length ? p : left
    })
  }, [s])

  if (!s)
    return (
      <main>
        <header className="top">
          <h1>🎮 Screeps dashboard</h1>
        </header>
        <div className="panel">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</div>
      </main>
    )

  const age = Math.max(0, Math.round((now - s.writtenAt) / 1000))
  const controls: ControlsSnapshot = { ...s.controls, ...(pending ?? {}) }
  const alerts = [
    ...s.threats.map(t => `Threat in ${t.room}: ${t.damage} damage/tick — ${t.defenders ? `${t.defenders} defender(s) sent` : "paused, can't win"}`),
    ...s.rooms.filter(r => 0 < r.threat.hostiles).map(r => `${r.threat.hostiles} hostile fighter(s) in home room ${r.name}`),
    ...s.rooms.filter(r => r.ticksToDowngrade < 5000).map(r => `${r.name} controller downgrades in ${r.ticksToDowngrade} ticks`),
    ...(s.cpu.bucket < 1000 ? [`CPU bucket low: ${s.cpu.bucket}`] : [])
  ]

  return (
    <main>
      <header className="top">
        <h1>🎮 Screeps dashboard</h1>
        <span>
          <strong>{s.username || "bot"}</strong> <span className="muted">{s.shard || "private server"}</span>
        </span>
        <span>tick {s.tick.toLocaleString()}</span>
        <span className="muted" title={new Date(s.writtenAt).toLocaleString()}>
          updated {age < 120 ? `${age}s` : `${Math.round(age / 60)}m`} ago
        </span>
        <span className={`badge ${data!.source === "file" ? "warn" : "good"}`}>
          {data!.source === "file" ? "snapshot file" : "live"}
        </span>
        {error && <span className="error">{error}</span>}
        <form method="post" action="/api/logout">
          <button className="button" type="submit">
            Sign out
          </button>
        </form>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>
            <Icon>🌍</Icon>
            Empire
          </h2>
          <div className="stats">
            <Stat label={`GCL ${s.gcl.level}`} value={`${Math.round((100 * s.gcl.progress) / Math.max(1, s.gcl.progressTotal))}%`}>
              <Bar value={s.gcl.progress} max={s.gcl.progressTotal} />
            </Stat>
            <Stat label="CPU (this tick)" value={`${s.cpu.used} / ${s.cpu.limit}`} />
            <Stat label="Bucket" value={s.cpu.bucket.toLocaleString()}>
              <Bar value={s.cpu.bucket} max={10000} />
            </Stat>
            <Stat label="Rooms" value={s.rooms.length} />
            <Stat label="Remote sources" value={s.remotes.length} />
            <Stat label="Income" value={`${s.rooms.reduce((sum, r) => sum + r.income, 0).toFixed(1)}/t`} />
          </div>
        </section>

        <ControlsPanel
          controls={controls}
          pending={!!pending}
          saving={saving}
          onAggression={(aggression: AggressionLevel) => change({ aggression })}
          onToggle={(key, value) => change({ [key]: value })}
        />

        <ScoutPanel
          snapshot={s}
          busy={saving}
          onRequest={room => command("/api/scout", { room })}
          onCancel={room => command("/api/scout", { room, cancel: true })}
        />

        {alerts.length > 0 && (
          <section className="panel alert">
            <h2>
              <Icon>🚨</Icon>
              Alerts
            </h2>
            <ul className="plain">
              {alerts.map(a => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="grid">
        {s.rooms.map(room => (
          <RoomPanel key={room.name} room={room}>
            {OVERLAYS.map(({ kind, field, label }) => {
              const id = `${kind}:${room.name}`
              return (
                <label className="toggle" key={kind}>
                  <input
                    type="checkbox"
                    checked={overlayPending[id] ?? room[field] ?? false}
                    disabled={saving || room[field] === undefined}
                    onChange={async e => {
                      const show = e.target.checked
                      if (await command("/api/overlay", { room: room.name, kind, show }))
                        setOverlayPending(p => ({ ...p, [id]: show }))
                    }}
                  />
                  <span>
                    {label} {id in overlayPending && <span className="badge warn">waiting for the bot</span>}
                  </span>
                </label>
              )
            })}
            <AbandonBase
              room={room.name}
              status={s.abandoning?.find(a => a.room === room.name)?.status ?? null}
              onlyRoom={s.rooms.length <= 1}
              busy={saving}
              onAbandon={(name, confirm) => command("/api/abandon", { room: name, confirm })}
              onCancel={name => command("/api/abandon", { room: name, cancel: true })}
            />
          </RoomPanel>
        ))}
      </div>

      <ExpansionPanel
        snapshot={s}
        busy={saving}
        onPick={target => command("/api/expansion", { target })}
        onCancel={() => command("/api/expansion", { cancel: true })}
        onClear={() => command("/api/expansion", { clear: true })}
      />

      <RemotesPanel snapshot={s}>
        <ContestSection
          snapshot={s}
          busy={saving}
          onContest={room => command("/api/contest", { room })}
          onCallOff={room => command("/api/contest", { room, cancel: true })}
        />
      </RemotesPanel>

      <div className="grid">
        <ThreatsPanel snapshot={s} />
        <HostilesPanel snapshot={s} />
        <RelationsPanel
          snapshot={s}
          busy={saving}
          onForgive={player => command("/api/relations", { forgive: player })}
          onRetaliate={player => command("/api/relations", { retaliate: player })}
          onCancelRetaliation={() => command("/api/relations", { cancelRetaliation: true })}
        />
        <HighwaysPanel snapshot={s} />
        <CpuPanel snapshot={s} />
      </div>

      <EnemyPanel snapshot={s} />
    </main>
  )
}
