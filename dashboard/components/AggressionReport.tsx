import type { AggressionIncidentSnapshot, AggressionSnapshot } from "@bot/snapshot"

const TONE_ICON = { good: "🟢", warn: "🟡", bad: "🔴" } as const
const ZONE_ICON: Record<string, string> = { ours: "🏠", theirs: "🏰", elsewhere: "🗺️" }

const ago = (tick: number, now: number) => `${(now - tick).toLocaleString()} ticks ago`

/**
 * What a player did to us (src/defence/aggressionLog.ts): the bot's reading of it, what got them flagged, totals,
 * and each incident (where, who, what, how, damage, kills, and anything that suggests we started it).
 */
export function AggressionReport({ a, tick }: { a: AggressionSnapshot; tick: number }) {
  return (
    <div className="aggression">
      <p className={`verdict ${a.verdict.tone}`}>
        {TONE_ICON[a.verdict.tone]} {a.verdict.text}
      </p>
      {a.flaggedFor && (
        <p className="muted">
          Flagged for: {a.flaggedFor}
          {a.flagged !== undefined && <> (tick {a.flagged.toLocaleString()})</>}
        </p>
      )}
      {a.incidents.length > 0 && (
        <details>
          <summary>
            {a.hits.toLocaleString()} hit{a.hits === 1 ? "" : "s"}, {a.damage.toLocaleString()} damage
            {a.killed > 0 && <>, {a.killed} of ours killed</>} · 🏠 {a.inOurs} in our rooms ({a.unprovokedOurs} unprovoked)
            · 🏰 {a.inTheirs} in theirs · 🗺️ {a.elsewhere} elsewhere · last {ago(a.last, tick)}
          </summary>
          <ul className="plain incidents">
            {a.incidents.map(i => (
              <Incident key={`${i.tick}:${i.room}:${i.attacker}:${i.target}:${i.how}`} i={i} tick={tick} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Incident({ i, tick }: { i: AggressionIncidentSnapshot; tick: number }) {
  return (
    <li className={i.zone === "ours" && !i.provoked ? "incident bad" : "incident"}>
      <div>
        <span aria-hidden="true">{ZONE_ICON[i.zone] ?? "•"}</span> <strong>{i.room}</strong>{" "}
        <span className="muted">({i.where})</span> · {ago(i.tick, tick)}
        {i.lastTick > i.tick && <span className="muted">, for {(i.lastTick - i.tick).toLocaleString()} ticks</span>}
      </div>
      <div>
        {i.attacker} → {i.target}: {i.how}, {i.damage.toLocaleString()} damage over {i.hits} hit{i.hits === 1 ? "" : "s"}
        {i.killed > 0 && <span className="badge bad">💀 {i.killed} killed</span>}
      </div>
      {i.provoked && <div className="muted">ℹ️ {i.provoked}</div>}
    </li>
  )
}
