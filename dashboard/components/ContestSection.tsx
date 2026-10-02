import { useEffect, useRef, useState } from "react"
import type { DashboardSnapshot, StrengthSnapshot } from "@bot/snapshot"
import { verdict } from "./EnemyPanel"
import { Bar, Empty } from "./ui"

/** What the bot asks of an automatic contest (see src/remote/contest.ts), for the dialog's reasoning. */
const STRENGTH_MARGIN = 2
const ROOM_NAME = /^[WE]\d{1,3}[NS]\d{1,3}$/

const thousands = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`)

/** What the dashboard knows about the room picked: who reserves it, their strength, what the planner thought. */
interface Target {
  room: string
  player?: string
  strength: StrengthSnapshot | null
  ally: boolean
  plannerVerdict?: string
}

function lookUp(s: DashboardSnapshot, room: string): Target {
  const candidate = s.contestCandidates?.find(c => c.room === room)
  if (candidate)
    return {
      room,
      player: candidate.player,
      strength: candidate.strength,
      ally: candidate.ally,
      plannerVerdict: candidate.verdict
    }
  const enemy = s.enemies?.find(e => e.rooms.some(r => r.room === room && r.kind === "remote"))
  if (enemy) return { room, player: enemy.player, strength: enemy.strength, ally: false }
  return { room, strength: null, ally: false }
}

/** Reasons for and against, from what we know (see src/defence/strength.ts). */
function considerations(t: Target, ours: StrengthSnapshot | undefined, aggression: string): { icon: string; text: string }[] {
  const out: { icon: string; text: string }[] = []
  if (!t.player)
    out.push({
      icon: "❔",
      text: "We have no recent intel showing this room reserved by another player. The bot checks when it gets the request and says why if it can't contest it."
    })
  if (t.ally) out.push({ icon: "⛔", text: `${t.player} is an ally: the bot won't attack allies and will refuse.` })
  const theirs = t.strength
  if (t.player && !theirs)
    out.push({
      icon: "⚠️",
      text: `We've never seen one of ${t.player}'s bases, so their strength is unknown: they could be far stronger than us.`
    })
  if (theirs && ours && 0 < ours.score) {
    const ratio = theirs.score / Math.max(1, ours.score)
    const advantage = ours.score / Math.max(1, theirs.score)
    if (ratio <= 1 / STRENGTH_MARGIN)
      out.push({
        icon: "✅",
        text: `We're ${advantage.toFixed(1)}× stronger: past the ${STRENGTH_MARGIN}× margin the bot wants before contesting on its own.`
      })
    else if (ratio < 1)
      out.push({
        icon: "⚠️",
        text: `We're stronger, but only ${advantage.toFixed(1)}×, under the ${STRENGTH_MARGIN}× margin the bot wants: a fight could go either way.`
      })
    else
      out.push({
        icon: "❌",
        text: `They're ${ratio.toFixed(1)}× as strong as us: expect to lose attackers, and a hard answer if they retaliate.`
      })
    if (0 < theirs.towers)
      out.push({
        icon: "🗼",
        text: `${theirs.towers} tower${theirs.towers === 1 ? "" : "s"} across their bases. Their remote has none, but their bases are well defended if this escalates.`
      })
    if (0 < theirs.army) out.push({ icon: "⚔️", text: `Up to ${theirs.army} of their combat parts seen at once.` })
    if (50000 <= theirs.stored)
      out.push({ icon: "📦", text: `${thousands(theirs.stored)} energy stored: they can afford to build an army.` })
  }
  if (aggression !== "aggressive")
    out.push({
      icon: "ℹ️",
      text: `Aggression is "${aggression}": the bot wouldn't contest a room on its own. Your pick goes ahead anyway.`
    })
  out.push({
    icon: "ℹ️",
    text: "Our attackers will kill their creeps there, which will likely make them treat us as hostile and retaliate on our remotes or bases."
  })
  out.push({
    icon: "💸",
    text: "Costs 2 attackers (replaced as they fall, up to 6) and a reserver until the room is ours. Given up after 6000 ticks."
  })
  return out
}

/**
 * The remote mining card's contest section (see src/remote/contest.ts): contests underway, rooms the planner could
 * contest, and a way to pick one, confirmed in a dialog that weighs it up.
 */
export function ContestSection({
  snapshot: s,
  busy,
  onContest,
  onCallOff
}: {
  snapshot: DashboardSnapshot
  busy: boolean
  onContest: (room: string) => Promise<boolean>
  onCallOff: (room: string) => void
}) {
  const [typed, setTyped] = useState("")
  const [target, setTarget] = useState<Target | null>(null)
  const contests = s.contests ?? []
  const candidates = (s.contestCandidates ?? []).filter(c => !contests.some(x => x.room === c.room))
  const request = s.contestRequest

  const pick = (room: string) => setTarget(lookUp(s, room.trim().toUpperCase()))

  return (
    <div className="contest">
      <h3>⚔️ Contesting</h3>
      {request?.status && (
        <p className="notice">
          Your {request.cancel ? "call-off" : "pick"} <strong>{request.room}</strong>: {request.status}
        </p>
      )}

      {contests.length > 0 && (
        <ul className="plain">
          {contests.map(c => (
            <li key={c.room} className="row">
              <span>
                🏴 <strong>{c.room}</strong> from {c.player}{" "}
                <span className="muted">
                  (sent from {c.home}, {(s.tick - c.started).toLocaleString()} ticks in): {c.status}
                </span>{" "}
                {c.manual && <span className="badge">your pick</span>}
              </span>
              <button className="button" disabled={busy} onClick={() => onCallOff(c.room)}>
                Call off
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length === 0 ? (
        <Empty>No rooms in reach are reserved by other players (as of the last plan).</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Reserved by</th>
                <th>Their strength</th>
                <th>Planner</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => {
                const v = verdict(c.strength, s.ourStrength)
                return (
                  <tr key={c.room}>
                    <td>{c.room}</td>
                    <td>
                      {c.player} {c.ally && <span className="badge good">ally</span>}
                    </td>
                    <td className={`verdict ${v.tone}`}>
                      {v.icon} {c.strength ? c.strength.score.toLocaleString() : "?"}
                    </td>
                    <td className="muted wrap">{c.verdict.replace(/^reserved by [^:,;(]+[:,;]?\s*/, "")}</td>
                    <td>
                      <button className="button" disabled={busy || c.ally} onClick={() => pick(c.room)}>
                        Contest…
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="row pick"
        onSubmit={e => {
          e.preventDefault()
          if (ROOM_NAME.test(typed.trim().toUpperCase())) pick(typed)
        }}
      >
        <label htmlFor="contest-room">Contest any room:</label>
        <input
          id="contest-room"
          value={typed}
          onChange={ev => setTyped(ev.target.value)}
          placeholder="e.g. W12N34"
          pattern="[WEwe]\d{1,3}[NSns]\d{1,3}"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="button" type="submit" disabled={busy || !ROOM_NAME.test(typed.trim().toUpperCase())}>
          Contest…
        </button>
      </form>

      {target && (
        <ConfirmContest
          target={target}
          ours={s.ourStrength}
          aggression={s.controls.aggression}
          busy={busy}
          onClose={() => setTarget(null)}
          onConfirm={async () => {
            if (await onContest(target.room)) {
              setTarget(null)
              setTyped("")
            }
          }}
        />
      )}
    </div>
  )
}

function ConfirmContest({
  target: t,
  ours,
  aggression,
  busy,
  onClose,
  onConfirm
}: {
  target: Target
  ours?: StrengthSnapshot
  aggression: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const v = verdict(t.strength, ours)
  const top = Math.max(t.strength?.score ?? 0, ours?.score ?? 0, 1)

  return (
    <dialog ref={ref} className="confirm" onClose={onClose} aria-labelledby="contest-title">
      <h2 id="contest-title">⚔️ Contest {t.room}?</h2>
      <p>
        {t.player ? (
          <>
            Reserved by <strong>{t.player}</strong>. Our attackers clear their creeps out, our reserver runs their
            reservation down, then we reserve and mine it.
          </>
        ) : (
          <>We don&apos;t know who reserves {t.room}.</>
        )}
      </p>

      {t.player && (
        <>
          <p className={`verdict ${v.tone}`}>
            {v.icon} {v.label}
          </p>
          <div className="versus">
            <div>
              <span className="muted">{t.player}</span> <strong>{t.strength ? t.strength.score.toLocaleString() : "?"}</strong>
              <Bar value={t.strength?.score ?? 0} max={top} color="var(--bad)" />
            </div>
            <div>
              <span className="muted">Us</span> <strong>{ours ? ours.score.toLocaleString() : "?"}</strong>
              <Bar value={ours?.score ?? 0} max={top} color="var(--good)" />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="num">🏰 Bases</th>
                  <th className="num">🗼 Towers</th>
                  <th className="num">📦 Stored</th>
                  <th className="num">⚔️ Army</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t.player}</td>
                  <td className="num">{t.strength?.bases ?? "?"}</td>
                  <td className="num">{t.strength?.towers ?? "?"}</td>
                  <td className="num">{t.strength ? thousands(t.strength.stored) : "?"}</td>
                  <td className="num">{t.strength?.army ?? "?"}</td>
                </tr>
                <tr>
                  <td>Us</td>
                  <td className="num">{ours?.bases ?? "?"}</td>
                  <td className="num">{ours?.towers ?? "?"}</td>
                  <td className="num">{ours ? thousands(ours.stored) : "?"}</td>
                  <td className="num">{ours?.army ?? "?"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <ul className="plain considerations">
        {considerations(t, ours, aggression).map(c => (
          <li key={c.text}>
            <span aria-hidden="true">{c.icon}</span> {c.text}
          </li>
        ))}
      </ul>
      {t.plannerVerdict && <p className="controls-help">Planner: {t.plannerVerdict}</p>}

      <div className="row actions">
        <button className="button" type="button" onClick={() => ref.current?.close()}>
          Keep the peace
        </button>
        <button className="button danger" type="button" disabled={busy || t.ally} onClick={onConfirm}>
          Contest {t.room}
        </button>
      </div>
    </dialog>
  )
}
