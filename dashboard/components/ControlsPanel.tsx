import type { AggressionLevel, ControlsSnapshot } from "@bot/snapshot"
import { Icon } from "./ui"

const LEVELS: { level: AggressionLevel; label: string; help: string }[] = [
  {
    level: "passive",
    label: "Passive",
    help: "Nobody becomes hostile just for attacking us, and no defenders go to remote rooms: threatened remotes are paused."
  },
  {
    level: "defensive",
    label: "Defensive",
    help: "Players who attack us become hostile. Remote threats get defenders when they can win with a margin."
  },
  {
    level: "aggressive",
    label: "Aggressive",
    help: "As defensive, and any non-allied player's armed creeps we see are hostile on sight: towers and defenders engage first. Remote defenders go without a margin."
  }
]

export function ControlsPanel({
  controls,
  pending,
  saving,
  onAggression,
  onToggle
}: {
  controls: ControlsSnapshot
  pending: boolean
  saving: boolean
  onAggression: (level: AggressionLevel) => void
  onToggle: (key: "remoteMining" | "expansion" | "scouting", value: boolean) => void
}) {
  const current = LEVELS.find(l => l.level === controls.aggression)
  return (
    <section className="panel">
      <h2>
        <Icon>🎛️</Icon>
        Controls {pending && <span className="badge warn">waiting for the bot</span>}
      </h2>
      <div className="segmented" role="radiogroup" aria-label="Aggression">
        {LEVELS.map(l => (
          <button
            key={l.level}
            role="radio"
            aria-checked={controls.aggression === l.level}
            className={controls.aggression === l.level ? "active" : ""}
            disabled={saving}
            onClick={() => controls.aggression !== l.level && onAggression(l.level)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="controls-help">{current?.help}</p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={controls.remoteMining}
          disabled={saving}
          onChange={e => onToggle("remoteMining", e.target.checked)}
        />
        <span>Remote mining</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={controls.expansion}
          disabled={saving}
          onChange={e => onToggle("expansion", e.target.checked)}
        />
        <span>Expansion (start new rooms)</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={controls.scouting ?? true}
          disabled={saving}
          onChange={e => onToggle("scouting", e.target.checked)}
        />
        <span>Scouting</span>
      </label>
      <p className="controls-help">
        Changes go to the bot&apos;s Memory.controls and apply on its next tick; this panel confirms them with the next
        snapshot (every 20 ticks).
      </p>
    </section>
  )
}
