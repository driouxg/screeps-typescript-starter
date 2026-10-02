import type { DashboardSnapshot } from "@bot/snapshot"
import { Empty } from "./ui"

type Props = { snapshot: DashboardSnapshot }

const ago = (tick: number, now: number) => `${(now - tick).toLocaleString()} ticks ago`

export function RemotesPanel({ snapshot: s }: Props) {
  return (
    <section className="panel span-all">
      <h2>
        Remote mining <span className="badge">{s.remotes.length} sources</span>
        {!s.controls.remoteMining && <span className="badge warn">switched off</span>}
      </h2>
      {s.remotes.length === 0 ? (
        <Empty>No remote sources chosen.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Home</th>
                <th className="num">Net/tick</th>
                <th className="num">Distance</th>
                <th>Status</th>
                <th className="num">Miners</th>
                <th className="num">Haulers</th>
                <th className="num">WORK / CARRY</th>
                <th className="num">Spawn</th>
                <th>Container</th>
              </tr>
            </thead>
            <tbody>
              {s.remotes.map(r => (
                <tr key={r.id}>
                  <td>
                    {r.room} <span className="muted">{r.x},{r.y}</span>
                  </td>
                  <td>{r.home}</td>
                  <td className="num">{r.net.toFixed(1)}</td>
                  <td className="num">{r.distance}</td>
                  <td>
                    {r.paused ? <span className="badge bad">paused</span> : <span className="badge good">mining</span>}{" "}
                    {r.reserve && <span className="badge">reserved</span>} {r.road && <span className="badge">road</span>}
                  </td>
                  <td className="num">{r.miners}</td>
                  <td className="num">{r.haulers}</td>
                  <td className="num">
                    {r.workParts} / {r.carryParts}
                  </td>
                  <td className="num">{Math.round(r.spawnLoad * 100)}%</td>
                  <td>{r.container === null ? <span className="muted">not visible</span> : r.container ? "built" : "building"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>Planner reasoning ({s.remoteReport.length} lines)</summary>
        <pre className="report">{s.remoteReport.join("\n")}</pre>
      </details>
    </section>
  )
}

export function ThreatsPanel({ snapshot: s }: Props) {
  return (
    <section className="panel">
      <h2>Remote threats</h2>
      {s.threats.length === 0 ? (
        <Empty>None.</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th className="num">Damage</th>
              <th className="num">Healing</th>
              <th className="num">Hits</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {s.threats.map(t => (
              <tr key={t.room}>
                <td>{t.room}</td>
                <td className="num">{t.damage}</td>
                <td className="num">{t.healing}</td>
                <td className="num">{t.hits}</td>
                <td>
                  {t.defenders ? (
                    <span className="badge warn">{t.defenders} defender(s)</span>
                  ) : (
                    <span className="badge bad">paused</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function HostilesPanel({ snapshot: s }: Props) {
  return (
    <section className="panel">
      <h2>Hostile creeps in sight</h2>
      {s.hostiles.length === 0 ? (
        <Empty>None in the rooms we can see.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Owner</th>
                <th>Body</th>
                <th className="num">Hits</th>
              </tr>
            </thead>
            <tbody>
              {s.hostiles.map((h, i) => (
                <tr key={i}>
                  <td>
                    {h.room} <span className="muted">{h.x},{h.y}</span>
                  </td>
                  <td>
                    {h.owner}{" "}
                    <span className={`badge ${h.relation === "hostile" ? "bad" : h.relation === "ally" ? "good" : ""}`}>
                      {h.relation}
                    </span>
                  </td>
                  <td>
                    {Object.entries(h.parts)
                      .map(([p, n]) => `${n} ${p}`)
                      .join(", ")}
                  </td>
                  <td className="num">
                    {h.hits}/{h.hitsMax}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function RelationsPanel({
  snapshot: s,
  busy,
  onForgive,
  onRetaliate,
  onCancelRetaliation
}: Props & {
  busy: boolean
  onForgive: (player: string) => void
  onRetaliate: (player: string) => void
  onCancelRetaliation: () => void
}) {
  const flagged = Object.entries(s.relations.hostilePlayers)
  const strike = s.retaliation ?? null
  const underway = strike !== null && strike.state !== "over"

  const retaliate = (player: string) => {
    if (
      window.confirm(
        `Send a squad at ${player}'s weak spot? The bot only goes for rooms without working towers or safe mode, and ` +
          `calls it off if there's none.`
      )
    )
      onRetaliate(player)
  }
  const retaliateButton = (player: string) => (
    <button
      className="button danger"
      disabled={busy || underway}
      title={underway ? "One strike at a time" : undefined}
      onClick={() => retaliate(player)}
    >
      Retaliate
    </button>
  )

  return (
    <section className="panel">
      <h2>Relations</h2>
      {strike && (
        <div className="danger-zone">
          <p className="row">
            <span>
              <span className={`badge ${underway ? "warn" : ""}`}>{underway ? strike.state : "last strike"}</span>{" "}
              {strike.player}
              {strike.target ? ` in ${strike.target}` : ""}
              {underway && strike.squad ? `, squad of ${strike.squad}` : ""}
            </span>
            <button className="button" disabled={busy} onClick={onCancelRetaliation}>
              {underway ? "Call off" : "Clear"}
            </button>
          </p>
          {strike.status && <p className="controls-help">{strike.status}</p>}
        </div>
      )}
      <h3>Allies</h3>
      {s.relations.allies.length ? <div className="chips">{s.relations.allies.map(a => <span key={a} className="chip">{a}</span>)}</div> : <Empty>None.</Empty>}
      <h3>Declared enemies</h3>
      {s.relations.enemies.length ? (
        <ul className="plain">
          {s.relations.enemies.map(name => (
            <li key={name} className="row">
              <span>{name}</span>
              {retaliateButton(name)}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>None.</Empty>
      )}
      <h3>Flagged for attacking us</h3>
      {flagged.length ? (
        <ul className="plain">
          {flagged.map(([name, tick]) => (
            <li key={name} className="row">
              <span>
                {name} <span className="muted">since tick {tick.toLocaleString()} ({ago(tick, s.tick)})</span>
              </span>
              <span>
                <button className="button" disabled={busy} onClick={() => onForgive(name)}>
                  Forgive
                </button>{" "}
                {retaliateButton(name)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nobody.</Empty>
      )}
    </section>
  )
}

export function HighwaysPanel({ snapshot: s }: Props) {
  return (
    <section className="panel">
      <h2>Highways</h2>
      {s.highways.length === 0 ? (
        <Empty>No remote roads planned (only built where they pay back).</Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th className="num">Roads</th>
              <th className="num">Missing</th>
              <th className="num">Below 50%</th>
              <th className="num">Sites</th>
              <th className="num">Lowest</th>
            </tr>
          </thead>
          <tbody>
            {s.highways.map(h => (
              <tr key={h.home + h.room}>
                <td>{h.room}</td>
                <td className="num">{h.tiles}</td>
                <td className="num">{h.missing}</td>
                <td className="num">{h.damaged}</td>
                <td className="num">{h.sites}</td>
                <td className="num">{Math.round(h.lowest * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function CpuPanel({ snapshot: s }: Props) {
  return (
    <section className="panel">
      <h2>CPU</h2>
      {s.cpuProfile.length === 0 ? (
        <Empty>
          Profiling is off. Run <code>Memory.cpuProfile = {"{}"}</code> in the game console to turn it on.
        </Empty>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th className="num">Per tick</th>
              <th className="num">Per call</th>
              <th className="num">Calls</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {s.cpuProfile.map(p => (
              <tr key={p.key}>
                <td>{p.key}</td>
                <td className="num">{p.perTick === undefined ? "–" : p.perTick.toFixed(2)}</td>
                <td className="num">{p.perCall.toFixed(3)}</td>
                <td className="num">{p.calls.toLocaleString()}</td>
                <td className="num">{p.cpu.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
