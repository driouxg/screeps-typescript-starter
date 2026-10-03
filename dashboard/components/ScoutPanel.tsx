import { useState } from "react"
import type { DashboardSnapshot } from "@bot/snapshot"
import { Empty, Icon } from "./ui"

/**
 * Ask for a room to be scouted (see src/expansion/scoutRequests.ts): the bot sends a scout from whichever base is
 * closest to it, and reports how it went.
 */
export function ScoutPanel({
  snapshot: s,
  busy,
  onRequest,
  onCancel
}: {
  snapshot: DashboardSnapshot
  busy: boolean
  onRequest: (room: string) => Promise<boolean>
  onCancel: (room: string) => void
}) {
  const [room, setRoom] = useState("")
  const requests = s.scoutRequests ?? []

  return (
    <section className="panel">
      <h2>
        <Icon>🔭</Icon>
        Scouting
        {!s.controls.scouting && <span className="badge warn">automatic off</span>}
      </h2>
      <form
        className="row pick"
        onSubmit={async e => {
          e.preventDefault()
          if (room.trim() && (await onRequest(room.trim().toUpperCase()))) setRoom("")
        }}
      >
        <label htmlFor="scout-room">Scout a room:</label>
        <input
          id="scout-room"
          value={room}
          onChange={ev => setRoom(ev.target.value)}
          placeholder="e.g. W12N34"
          pattern="[WEwe]\d{1,3}[NSns]\d{1,3}"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="button" type="submit" disabled={busy || !room.trim()}>
          Send scout
        </button>
      </form>
      <p className="controls-help">
        A recon scout (one MOVE part, 50 energy) comes from the base closest to it (fewest rooms away, around hostile
        rooms). It&apos;s spawned ahead of everything but defence, even with automatic scouting off.
      </p>
      {requests.length === 0 ? (
        <Empty>No rooms asked for.</Empty>
      ) : (
        <ul className="plain">
          {requests.map(r => (
            <li key={r.room} className="row">
              <span>
                {r.done ? (r.status.startsWith("failed") ? "❌" : "✅") : "🧭"} <strong>{r.room}</strong>{" "}
                <span className="muted">{r.status}</span>
              </span>
              <button className="button" disabled={busy} onClick={() => onCancel(r.room)}>
                {r.done ? "Clear" : "Cancel"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
