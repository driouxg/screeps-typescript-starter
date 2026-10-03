import { useEffect, useRef, useState } from "react"
import type {
  ConquestCandidateSnapshot,
  ConquestConcern,
  ConquestSnapshot,
  DashboardSnapshot,
  StrengthSnapshot
} from "@bot/snapshot"
import { verdict } from "./EnemyPanel"
import { Bar, Empty, Icon } from "./ui"

const thousands = (n: number) => (n < 1000 ? `${Math.round(n)}` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`)

const TONE_ICON: Record<ConquestConcern["tone"], string> = { good: "✅", warn: "⚠️", bad: "❌", info: "ℹ️" }
const KIND_ICON: Record<string, string> = {
  dismantler: "⛏️",
  attacker: "🗡️",
  ranged: "🏹",
  healer: "💚",
  claimer: "🚩"
}
/** The order a conquest goes through (see src/conquest/conquest.ts). */
const STATES = ["scouting", "staging", "rallying", "marching", "engaged"]
const PHASES = ["breach", "raze", "claim"]
const PART_ORDER = ["tough", "work", "attack", "ranged_attack", "heal", "claim", "move"]

function parts(p: { [part: string]: number }): string {
  return Object.entries(p)
    .sort((a, b) => PART_ORDER.indexOf(a[0]) - PART_ORDER.indexOf(b[0]))
    .map(([part, n]) => `${n} ${part.replace("_", " ").toUpperCase()}`)
    .join(" · ")
}

export interface ApproveOptions {
  force: boolean
  template?: string
}

/**
 * Conquest (see src/conquest/): the other players' bases the bot has ranked for taking, best first, with how it would
 * break in and what squad it would send; the conquest underway; and the player's sign-off, which every conquest needs.
 */
export function ConquestPanel({
  snapshot: s,
  busy,
  onApprove,
  onCallOff
}: {
  snapshot: DashboardSnapshot
  busy: boolean
  onApprove: (room: string, options: ApproveOptions) => Promise<boolean>
  onCallOff: (room: string) => void
}) {
  const [review, setReview] = useState<ConquestCandidateSnapshot | null>(null)
  const candidates = s.conquestCandidates ?? []
  const active = s.conquest && s.conquest.state !== "over" ? s.conquest : null
  const ended = s.conquest && s.conquest.state === "over" ? s.conquest : null
  const request = s.conquestRequest
  const feasible = candidates.filter(c => c.feasible).length
  const undecided = candidates.filter(c => c.needsDecision).length

  return (
    <section className="panel span-all">
      <h2>
        <Icon>🏰</Icon>
        Conquest <span className="badge">{candidates.length} bases assessed</span>
        {feasible > 0 && <span className="badge good">{feasible} we could take</span>}
        {undecided > 0 && <span className="badge warn">{undecided} need your call</span>}
        {active && <span className="badge bad">underway: {active.room}</span>}
      </h2>
      <p className="controls-help">
        The bot never attacks a base on its own: it ranks what it could take and waits for you to approve one.
        {s.conquestAssessed !== undefined && (
          <> Last assessed {(s.tick - s.conquestAssessed).toLocaleString()} ticks ago.</>
        )}
      </p>

      {request?.status && (
        <p className="notice">
          Your {request.action === "cancel" ? "call-off" : "approval"} of <strong>{request.room}</strong>: {request.status}
        </p>
      )}

      {active && (
        <ActiveConquest
          c={active}
          tick={s.tick}
          busy={busy}
          candidate={candidates.find(x => x.room === active.room)}
          onReview={setReview}
          onCallOff={onCallOff}
        />
      )}
      {ended?.result && (
        <p className="muted">
          Last conquest, {ended.room} ({ended.player}): {ended.result}
        </p>
      )}

      {candidates.length === 0 ? (
        <Empty>
          No other player&apos;s base scouted yet. Scouts map the walls and towers of every base they see; you can send one
          from the scouting card.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Base</th>
                <th>Defences</th>
                <th>Way in</th>
                <th>Squad</th>
                <th className="num">Waves · energy</th>
                <th className="num">Score</th>
                <th>Bot&apos;s verdict</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={c.room} className={c.feasible ? "" : "dim"}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <strong>{c.room}</strong> {c.player}
                    <div className="muted">
                      RCL {c.rcl} · {c.sources} src{c.home ? ` · ${c.distance} from ${c.home}` : ""}
                    </div>
                  </td>
                  <td>
                    🗼 {c.towers}
                    {c.towers > 0 && <span className="muted"> ({thousands(c.towerEnergy)} e)</span>}
                    {c.defenders > 0 && <> · ⚔️ {c.defenders}</>}
                    {c.safeModeAvailable > 0 && <span className="badge warn">safe mode ×{c.safeModeAvailable}</span>}
                    {c.safeModeUntil && <span className="badge bad">in safe mode</span>}
                  </td>
                  <td>
                    {c.breach ? (
                      <>
                        {c.breach.backdoor ? (
                          <span className="badge good">backdoor</span>
                        ) : (
                          <>{thousands(c.breach.hits)} hits</>
                        )}{" "}
                        <span className="muted">
                          from {c.breach.side}, {c.breach.breachDamage} dmg/t
                        </span>
                      </>
                    ) : (
                      <span className="muted">not mapped</span>
                    )}
                  </td>
                  <td>
                    {c.squad ? (
                      <>
                        {c.squad.template} ×{c.squad.members.length}
                        <div className={`muted ${c.squad.healShort ? "bad-text" : ""}`}>
                          heal {c.squad.heal} vs {c.incoming}/t
                        </div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    {c.estimate ? (
                      <>
                        {c.estimate.waves} · {thousands(c.estimate.energy)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{c.score.toLocaleString()}</td>
                  <td className="wrap">
                    {c.feasible ? "✅" : "❌"} {c.verdict}
                    {c.needsDecision && (
                      <div>
                        <span className="badge warn">your call: {c.needsDecision}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <button className="button" disabled={busy || (!!active && active.room !== c.room)} onClick={() => setReview(c)}>
                      Review…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {review && (
        <ReviewConquest
          c={review}
          ours={s.ourStrength}
          templates={s.conquestTemplates ?? []}
          awaiting={active?.room === review.room && active.state === "awaiting"}
          underway={!!active && active.room === review.room && active.state !== "awaiting"}
          busy={busy}
          onClose={() => setReview(null)}
          onApprove={async options => {
            if (await onApprove(review.room, options)) setReview(null)
          }}
        />
      )}
    </section>
  )
}

function ActiveConquest({
  c,
  tick,
  busy,
  candidate,
  onReview,
  onCallOff
}: {
  c: ConquestSnapshot
  tick: number
  busy: boolean
  candidate?: ConquestCandidateSnapshot
  onReview: (c: ConquestCandidateSnapshot) => void
  onCallOff: (room: string) => void
}) {
  const step = STATES.indexOf(c.state)
  return (
    <div className="conquest-active">
      <div className="row">
        <span>
          ⚔️ <strong>{c.room}</strong> from {c.player}{" "}
          <span className="muted">
            ({c.template} squad from {c.home}, via {c.staging} on the {c.side}; approved{" "}
            {(tick - c.approved).toLocaleString()} ticks ago)
          </span>{" "}
          {c.forced && <span className="badge warn">overridden</span>}
          {c.retreating && <span className="badge bad">pulled back to heal</span>}
        </span>
        <button className="button danger" disabled={busy} onClick={() => onCallOff(c.room)}>
          Call off
        </button>
      </div>

      {c.state === "awaiting" ? (
        <div className="notice">
          <strong>Needs your call:</strong> {c.status}{" "}
          {candidate && (
            <button className="button primary" disabled={busy} onClick={() => onReview(candidate)}>
              Review and decide…
            </button>
          )}
        </div>
      ) : (
        <>
          <ol className="steps">
            {STATES.map((st, i) => (
              <li key={st} className={i < step ? "done" : i === step ? "current" : ""}>
                {st}
              </li>
            ))}
          </ol>
          {c.state === "engaged" && (
            <ol className="steps">
              {PHASES.map((p, i) => (
                <li key={p} className={i < PHASES.indexOf(c.phase) ? "done" : p === c.phase ? "current" : ""}>
                  {p === "breach" && c.barriersLeft !== undefined && p === c.phase ? `breach (${c.barriersLeft} left)` : p}
                </li>
              ))}
            </ol>
          )}
          <p>
            Wave {c.wave} of {c.maxWaves}: {c.status}
          </p>
        </>
      )}

      {c.squad.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Wave</th>
                <th>Room</th>
                <th>Ticks to live</th>
                <th>Hits</th>
              </tr>
            </thead>
            <tbody>
              {c.squad.map(m => (
                <tr key={m.name}>
                  <td>
                    {KIND_ICON[m.kind] ?? "•"} {m.kind} <span className="muted">{m.name}</span>
                  </td>
                  <td className="num">{m.wave}</td>
                  <td>{m.room}</td>
                  <td>
                    {m.ttl}
                    <Bar value={m.ttl} max={1500} />
                  </td>
                  <td>
                    {Math.round((100 * m.hits) / Math.max(1, m.hitsMax))}%
                    <Bar value={m.hits} max={m.hitsMax} color={m.hits < m.hitsMax * 0.55 ? "var(--bad)" : "var(--good)"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReviewConquest({
  c,
  ours,
  templates,
  awaiting,
  underway,
  busy,
  onClose,
  onApprove
}: {
  c: ConquestCandidateSnapshot
  ours?: StrengthSnapshot
  templates: { name: string; description: string; minCapacity: number }[]
  awaiting: boolean
  underway: boolean
  busy: boolean
  onClose: () => void
  onApprove: (options: ApproveOptions) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [force, setForce] = useState(false)
  const [template, setTemplate] = useState("")
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const v = verdict(c.playerStrength, ours)
  const top = Math.max(c.playerStrength?.score ?? 0, ours?.score ?? 0, 1)
  const stale = c.siegeAge === undefined || 5000 < c.siegeAge || 5000 < c.intelAge
  const canApprove = !underway && !!c.home && !c.safeModeUntil && (c.feasible || force || stale)

  return (
    <dialog ref={ref} className="confirm wide" onClose={onClose} aria-labelledby="conquest-title">
      <h2 id="conquest-title">
        🏰 Conquer {c.room}? <span className="muted">{c.player}&apos;s RCL {c.rcl} base</span>
      </h2>
      <p className={`verdict ${c.feasible ? "good" : "bad"}`}>
        {c.feasible ? "✅" : "❌"} {c.verdict}
      </p>
      {c.needsDecision && (
        <p className="notice">
          <strong>The bot isn&apos;t sure:</strong> {c.needsDecision}. Weigh it up below.
        </p>
      )}

      <h3>Why</h3>
      <ul className="plain considerations">
        <li>
          <span aria-hidden="true">🎁</span> Reward {c.reward.toLocaleString()}: {c.rewardNotes.join("; ")}.
        </li>
        {c.concerns.map(x => (
          <li key={x.text}>
            <span aria-hidden="true">{TONE_ICON[x.tone]}</span> {x.text}
          </li>
        ))}
        <li>
          <span aria-hidden="true">📊</span> Score {c.score.toLocaleString()} (reward per 1000 energy, cost ×{c.risk} for
          risk).
        </li>
      </ul>

      <h3>{c.player} overall vs us</h3>
      <p className={`verdict ${v.tone}`}>
        {v.icon} {v.label}
      </p>
      <div className="versus">
        <div>
          <span className="muted">{c.player}</span>{" "}
          <strong>{c.playerStrength ? c.playerStrength.score.toLocaleString() : "?"}</strong>
          <Bar value={c.playerStrength?.score ?? 0} max={top} color="var(--bad)" />
          <span className="muted">
            {c.playerStrength
              ? `${c.playerStrength.bases} base(s), ${c.playerStrength.towers} towers, ${thousands(c.playerStrength.stored)} stored`
              : "unknown"}
          </span>
        </div>
        <div>
          <span className="muted">Us</span> <strong>{ours ? ours.score.toLocaleString() : "?"}</strong>
          <Bar value={ours?.score ?? 0} max={top} color="var(--good)" />
          <span className="muted">
            {ours ? `${ours.bases} base(s), ${ours.towers} towers, ${thousands(ours.stored)} stored` : ""}
          </span>
        </div>
      </div>

      <h3>Ways in</h3>
      {c.sides.length === 0 ? (
        <Empty>Walls not mapped yet: approving sends a scout first.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Side</th>
                <th>Gather in</th>
                <th className="num">Barriers</th>
                <th className="num">Hits</th>
                <th className="num">Tower dmg/t</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.sides.map(side => (
                <tr key={side.side} className={side.reachable ? "" : "dim"}>
                  <td>
                    {side.side} {c.breach?.side === side.side && <span className="badge good">plan</span>}
                  </td>
                  <td>{side.staging || "—"}</td>
                  <td className="num">{side.barriers}</td>
                  <td className="num">{thousands(side.hits)}</td>
                  <td className="num">{side.breachDamage}</td>
                  <td>
                    {side.backdoor && <span className="badge good">backdoor</span>}{" "}
                    {!side.reachable && <span className="muted">no safe route</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.breach && c.breach.barriers.length > 0 && (
        <p className="muted">
          Breaking through, outermost first:{" "}
          {c.breach.barriers.map(b => `${b.type} at ${b.x},${b.y} (${thousands(b.hits)})`).join(" → ")}
        </p>
      )}

      {c.squad && (
        <>
          <h3>Squad ({c.squad.template})</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {c.squad.members.map((m, i) => (
                  <tr key={i}>
                    <td>
                      {KIND_ICON[m.kind] ?? "•"} {m.kind}
                    </td>
                    <td className="muted">{parts(m.parts)}</td>
                    <td className="num">{thousands(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Heals {c.squad.heal}/t against {c.incoming}/t incoming · takes {c.squad.siegeRate} hits/t off walls ·{" "}
            {c.squad.dps} dmg/t to creeps · {thousands(c.squad.cost)} energy a wave
            {c.squad.unaffordable && <> · ⚠️ {c.squad.unaffordable}</>}
          </p>
        </>
      )}
      {c.estimate && (
        <p className="muted">
          Trip ~{c.estimate.travelTicks} ticks · breach ~{c.estimate.breachTicks} · raze ~{c.estimate.razeTicks} ·{" "}
          {c.estimate.waves} wave(s) · ~{thousands(c.estimate.energy)} energy in all. Each wave is renewed at home until
          its members have about the same ticks to live, then sets out together.
        </p>
      )}

      <h3>Your decision</h3>
      <label className="toggle">
        <span>Squad:</span>
        <select value={template} onChange={e => setTemplate(e.target.value)}>
          <option value="">Bot&apos;s pick for our RCL{c.squad ? ` (${c.squad.template})` : ""}</option>
          {templates.map(t => (
            <option key={t.name} value={t.name}>
              {t.name}: {t.description}
            </option>
          ))}
        </select>
      </label>
      {!c.feasible && !stale && (
        <label className="toggle">
          <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
          <span>Override: go anyway, although the bot thinks it can&apos;t win</span>
        </label>
      )}
      <ul className="plain considerations">
        <li>
          <span aria-hidden="true">ℹ️</span> Approving treats {c.player} as hostile from now on: our defence fights their
          creeps and paths avoid their rooms.
        </li>
        {stale && (
          <li>
            <span aria-hidden="true">🔭</span> A scout goes first for a fresh look; if the plan doesn&apos;t hold up the bot
            stops and asks you again.
          </li>
        )}
        {underway && (
          <li>
            <span aria-hidden="true">⚔️</span> Already underway: call it off from the conquest card.
          </li>
        )}
      </ul>

      <div className="row actions">
        <button className="button" type="button" onClick={() => ref.current?.close()}>
          Not now
        </button>
        <button
          className="button danger"
          type="button"
          disabled={busy || !canApprove}
          onClick={() => onApprove({ force, template: template || undefined })}
        >
          {awaiting ? "Go ahead" : "Approve conquest"} of {c.room}
        </button>
      </div>
    </dialog>
  )
}
