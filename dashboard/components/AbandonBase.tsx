import { useState } from "react"

/**
 * Tear down a base: everything in it is destroyed and the controller unclaimed, which can't be undone, so the room's
 * name has to be typed to confirm.
 */
export function AbandonBase({
  room,
  status,
  onlyRoom,
  busy,
  onAbandon,
  onCancel
}: {
  room: string
  /** The bot's progress, while it's being abandoned. */
  status: string | null
  onlyRoom: boolean
  busy: boolean
  onAbandon: (room: string, confirm: string) => void
  onCancel: (room: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")

  if (status !== null)
    return (
      <div className="danger-zone">
        <p className="row">
          <span>
            <span className="badge bad">abandoning</span> {status}
          </span>
          <button className="button" disabled={busy} onClick={() => onCancel(room)}>
            Stop
          </button>
        </p>
        <p className="controls-help">Stopping only helps before the bot starts destroying structures.</p>
      </div>
    )

  if (onlyRoom) return null

  if (!open)
    return (
      <div className="danger-zone">
        <button className="button danger" onClick={() => setOpen(true)}>
          Abandon base…
        </button>
      </div>
    )

  return (
    <form
      className="danger-zone"
      onSubmit={e => {
        e.preventDefault()
        onAbandon(room, typed.trim())
      }}
    >
      <p className="controls-help">
        Kills this room&apos;s creeps, drops its remotes, destroys every structure (energy in storage is lost) and
        unclaims the controller. The bot won&apos;t pick it again on its own. Type <strong>{room}</strong> to confirm.
      </p>
      <div className="row">
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={room}
          aria-label={`Type ${room} to confirm`}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="button danger" type="submit" disabled={busy || typed.trim() !== room}>
          Abandon {room}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setOpen(false)
            setTyped("")
          }}
        >
          Keep it
        </button>
      </div>
    </form>
  )
}
