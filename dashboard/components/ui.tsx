import type { ReactNode } from "react"

export function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {children}
    </div>
  )
}

export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${share * 100}%`, ...(color ? { background: color } : {}) }} />
    </div>
  )
}

/** An emoji in a tinted chip, at the start of a card's heading, so cards are told apart at a glance. */
export function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="icon" aria-hidden="true">
      {children}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}
