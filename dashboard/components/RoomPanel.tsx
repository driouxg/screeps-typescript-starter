import type { ReactNode } from "react"
import type { RoomSnapshot } from "@bot/snapshot"
import { Bar, Icon, Stat } from "./ui"

export function RoomPanel({ room, children }: { room: RoomSnapshot; children?: ReactNode }) {
  const now = room.buildNext.filter(s => s.rcl <= room.rcl)
  const later = room.buildNext.filter(s => s.rcl > room.rcl)
  const creeps = Object.entries(room.creeps).sort((a, b) => b[1] - a[1])
  const total = creeps.reduce((sum, [, n]) => sum + n, 0)

  return (
    <section className="panel">
      <h2>
        <Icon>🏰</Icon>
        {room.name} <span className="badge">RCL {room.rcl}</span>
        {room.safeMode > 0 && <span className="badge good">safe mode {room.safeMode}</span>}
        {room.threat.hostiles > 0 && <span className="badge bad">{room.threat.hostiles} hostiles</span>}
      </h2>
      <div className="stats">
        <Stat
          label={`Next level`}
          value={room.progressTotal ? `${Math.round((100 * room.progress) / room.progressTotal)}%` : "max"}
        >
          <Bar value={room.progress} max={room.progressTotal} />
        </Stat>
        <Stat label="Upgrading" value={room.upgradeRate === null ? "—" : `${room.upgradeRate}/t`} />
        <Stat label="Income (est.)" value={`${room.income}/t`} />
        <Stat label="Spawn energy" value={`${room.energyAvailable}/${room.energyCapacity}`}>
          <Bar value={room.energyAvailable} max={room.energyCapacity} />
        </Stat>
        <Stat label="Stored" value={room.storedEnergy.toLocaleString()} />
        <Stat label="Spawn busy" value={`${Math.round(room.spawnUse * 100)}%`}>
          <Bar value={room.spawnUse} max={1} color={room.spawnUse > 0.85 ? "var(--warn)" : undefined} />
        </Stat>
      </div>

      <h3>🐜 Creeps ({total})</h3>
      <div className="chips">
        {creeps.map(([role, n]) => (
          <span key={role} className="chip">
            {role.toLowerCase().replace(/_/g, " ")} {n}
          </span>
        ))}
      </div>

      {room.towerEnergy.length > 0 && (
        <>
          <h3>🗼 Towers</h3>
          <div className="chips">
            {room.towerEnergy.map((e, i) => (
              <span key={i} className="chip">
                {e}/1000
              </span>
            ))}
          </div>
        </>
      )}

      <h3>🏗️ Building next ({room.constructionSites} sites open)</h3>
      {now.length === 0 ? (
        <p className="muted">Nothing more at this RCL.</p>
      ) : (
        <ul className="plain">
          {now.map(s => (
            <li key={`${s.type}${s.x},${s.y}`}>
              {s.type} at {s.x},{s.y} {s.site && <span className="badge good">site placed</span>}
            </li>
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <>
          <h3>⏳ Later</h3>
          <ul className="plain">
            {later.map(s => (
              <li key={`${s.type}${s.x},${s.y}`} className="muted">
                {s.type} at {s.x},{s.y} — RCL {s.rcl}
              </li>
            ))}
          </ul>
        </>
      )}
      {children}
    </section>
  )
}
