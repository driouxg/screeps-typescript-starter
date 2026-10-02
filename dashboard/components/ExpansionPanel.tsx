import { useState } from "react"
import type { DashboardSnapshot } from "@bot/snapshot"
import { Empty } from "./ui"

/**
 * The expansion underway, the rooms the bot would pick (best first), and the player's own pick: from the list, or any
 * room by name. Picks go to Memory.expansionRequest; the bot checks them and reports back in the next snapshot.
 */
export function ExpansionPanel({
  snapshot: s,
  busy,
  onPick,
  onCancel,
  onClear
}: {
  snapshot: DashboardSnapshot
  busy: boolean
  onPick: (room: string) => void
  onCancel: () => void
  onClear: () => void
}) {
  const [room, setRoom] = useState("")
  const e = s.expansion
  const request = s.expansionRequest
  const candidates = s.expansionCandidates ?? []
  const gclFree = s.rooms.length < s.gcl.level

  return (
    <section className="panel span-all">
      <h2>
        Expansion {!s.controls.expansion && <span className="badge warn">automatic off</span>}
        <span className={`badge ${gclFree ? "good" : ""}`}>
          {s.rooms.length} / {s.gcl.level} rooms (GCL)
        </span>
      </h2>

      {e ? (
        <p className="row">
          <span>
            <strong>{e.target}</strong> from {e.home}: <span className="badge">{e.state}</span>{" "}
            {e.manual && <span className="badge">your pick</span>}{" "}
            <span className="muted">started {(s.tick - e.started).toLocaleString()} ticks ago</span>
          </span>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => confirm(`Stop expanding to ${e.target}?`) && onCancel()}
          >
            Cancel expansion
          </button>
        </p>
      ) : (
        <Empty>
          None underway.{" "}
          {gclFree ? "Needs a home at RCL 3+ with a spawn." : "Needs a free GCL level (the next one is in progress)."}
        </Empty>
      )}

      {request && (
        <p className="row notice">
          <span>
            {request.cancel ? (
              "Cancelling the expansion…"
            ) : (
              <>
                Your pick: <strong>{request.target}</strong> — {request.status ?? "sent, waiting for the bot"}
              </>
            )}
          </span>
          {!request.cancel && (
            <button className="button" disabled={busy} onClick={onClear}>
              Withdraw
            </button>
          )}
        </p>
      )}

      <h3>Rooms the bot would pick</h3>
      {s.expansionSingleSource && (
        <p className="muted">No two-source room is known within 20 rooms, so one-source rooms are included.</p>
      )}
      {candidates.length === 0 ? (
        <Empty>
          {s.expansionCandidates
            ? "None found yet: rooms 2-6 away need scouting, and must have two sources and a free controller."
            : "The bot hasn't reported candidates yet (it needs the latest code)."}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>From</th>
                <th className="num">Sources</th>
                <th className="num">Distance</th>
                <th className="num">Score</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={c.room}>
                  <td>
                    {c.room} {i === 0 && <span className="badge good">best</span>}
                  </td>
                  <td>{c.home}</td>
                  <td className="num">{c.sources}</td>
                  <td className="num">{c.distance}</td>
                  <td className="num">{c.score}</td>
                  <td className="num">
                    <button
                      className="button"
                      disabled={busy || e?.target === c.room || request?.target === c.room}
                      onClick={() => onPick(c.room)}
                    >
                      Expand here
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="row pick"
        onSubmit={ev => {
          ev.preventDefault()
          if (room.trim()) onPick(room.trim().toUpperCase())
        }}
      >
        <label htmlFor="expand-room">Or pick any room:</label>
        <input
          id="expand-room"
          value={room}
          onChange={ev => setRoom(ev.target.value)}
          placeholder="e.g. W12N34"
          pattern="[WEwe]\d{1,3}[NSns]\d{1,3}"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="button" type="submit" disabled={busy || !room.trim()}>
          Propose
        </button>
      </form>
      <p className="controls-help">
        Your pick ignores the two-source rule and distance limits, and goes ahead even with automatic expansion off. It
        waits for a free GCL level, and replaces an expansion that hasn&apos;t claimed yet. The claimer has to reach it
        within 10 rooms.
      </p>
    </section>
  )
}
