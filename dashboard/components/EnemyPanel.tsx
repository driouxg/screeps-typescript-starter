import type { DashboardSnapshot, EnemySnapshot, StrengthSnapshot } from "@bot/snapshot"
import { Bar, Empty, Icon, Stat } from "./ui"

const KIND_ICON: Record<EnemySnapshot["rooms"][number]["kind"], string> = {
  base: "🏰",
  remote: "⛏️",
  "army seen": "⚔️"
}

/** How they compare with us, from the ratio of their strength to ours (see src/defence/strength.ts). */
function verdict(theirs: StrengthSnapshot | null, ours: StrengthSnapshot | undefined) {
  if (!theirs || !ours || ours.score <= 0)
    return { icon: "❔", label: "unknown: none of their bases seen", tone: "" }
  const ratio = theirs.score / ours.score
  if (ratio < 0.5) return { icon: "🟢", label: `much weaker (${ratio.toFixed(2)}× us)`, tone: "good" }
  if (ratio < 1) return { icon: "🟡", label: `weaker (${ratio.toFixed(2)}× us)`, tone: "warn" }
  if (ratio < 2) return { icon: "🟠", label: `about as strong (${ratio.toFixed(2)}× us)`, tone: "warn" }
  return { icon: "🔴", label: `much stronger (${ratio.toFixed(1)}× us)`, tone: "bad" }
}

const ago = (tick: number, now: number) => `${(now - tick).toLocaleString()} ticks ago`
const thousands = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`)

/**
 * What we know about each player we treat as hostile (src/dashboard/enemyReport.ts): their strength next to ours,
 * and every room of theirs we've seen.
 */
export function EnemyPanel({ snapshot: s }: { snapshot: DashboardSnapshot }) {
  const enemies = s.enemies ?? []
  return (
    <section className="panel span-all">
      <h2>
        <Icon>🕵️</Icon>
        Enemy intel <span className="badge">{enemies.length} hostile</span>
      </h2>
      {enemies.length === 0 ? (
        <Empty>No hostile players. Anyone who attacks us is flagged and shows up here with what we know of them.</Empty>
      ) : (
        <div className="enemies">
          {enemies.map(e => (
            <EnemyCard key={e.player} enemy={e} ours={s.ourStrength} now={s.tick} />
          ))}
        </div>
      )}
    </section>
  )
}

function EnemyCard({ enemy: e, ours, now }: { enemy: EnemySnapshot; ours?: StrengthSnapshot; now: number }) {
  const v = verdict(e.strength, ours)
  const top = Math.max(e.strength?.score ?? 0, ours?.score ?? 0, 1)
  return (
    <article className="enemy">
      <header className="row">
        <strong className="enemy-name">👤 {e.player}</strong>
        <span className="chips">
          {e.flaggedSince !== undefined && (
            <span className="badge bad" title={`tick ${e.flaggedSince.toLocaleString()}`}>
              attacked us {ago(e.flaggedSince, now)}
            </span>
          )}
          {e.declared && <span className="badge warn">declared enemy</span>}
        </span>
      </header>

      <p className={`verdict ${v.tone}`}>
        {v.icon} {v.label}
      </p>

      <div className="versus">
        <div>
          <span className="muted">Them</span> <strong>{e.strength ? e.strength.score.toLocaleString() : "?"}</strong>
          <Bar value={e.strength?.score ?? 0} max={top} color="var(--bad)" />
        </div>
        <div>
          <span className="muted">Us</span> <strong>{ours ? ours.score.toLocaleString() : "?"}</strong>
          <Bar value={ours?.score ?? 0} max={top} color="var(--good)" />
        </div>
      </div>

      <div className="stats">
        <Stat label="🏰 Bases" value={e.strength?.bases ?? "?"} />
        <Stat label="🗼 Towers" value={e.strength?.towers ?? "?"} />
        <Stat label="📦 Stored" value={e.strength ? thousands(e.strength.stored) : "?"} />
        <Stat label="⚔️ Combat parts" value={e.combatParts} />
        <Stat label="👁️ Last seen" value={e.lastSeen ? ago(e.lastSeen, now) : "never"} />
      </div>

      {e.rooms.length === 0 ? (
        <Empty>We haven&apos;t seen any room of theirs yet: scouts may find one.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>What</th>
                <th className="num">RCL</th>
                <th className="num">Towers</th>
                <th>Safe mode</th>
                <th className="num">Stored</th>
                <th className="num">Army</th>
                <th className="num">Seen</th>
              </tr>
            </thead>
            <tbody>
              {e.rooms.map(r => (
                <tr key={r.room}>
                  <td>{r.room}</td>
                  <td>
                    {KIND_ICON[r.kind]} {r.kind}
                  </td>
                  <td className="num">{r.rcl ?? "—"}</td>
                  <td className="num">
                    {r.towers === undefined ? "—" : r.towers}
                    {r.towers ? <span className="muted"> ({thousands(r.towerEnergy ?? 0)}⚡)</span> : null}
                  </td>
                  <td>
                    {r.safeModeUntil
                      ? `🛡️ on, ${(r.safeModeUntil - now).toLocaleString()} left`
                      : r.safeModeAvailable !== undefined
                      ? `${r.safeModeAvailable} charge${r.safeModeAvailable === 1 ? "" : "s"}`
                      : "—"}
                  </td>
                  <td className="num">{r.stored === undefined ? "—" : thousands(r.stored)}</td>
                  <td className="num">{r.combatParts ?? "—"}</td>
                  <td className="num muted">{ago(r.seen, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}
