import type { PresenceStatus } from '../types'
import type { OfficeSession, OfficeUi } from '../net/session'
import { STATUS_FRAME, StatusIcon } from './StatusIcon'

const STATUSES: { id: PresenceStatus; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'away', label: 'Away' },
  { id: 'focus', label: 'Focus' },
]

type Props = {
  ui: OfficeUi
  session: OfficeSession
  onLeave: () => void
}

export function Hud({ ui, session, onLeave }: Props) {
  async function copyLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('room', ui.roomName)
    await navigator.clipboard.writeText(url.toString())
  }

  return (
    <header className="hud" data-testid="hud">
      <div className="hud-brand">Office</div>
      <div className="hud-meta">
        <span>
          Room <strong data-testid="current-room">{ui.roomName}</strong>
        </span>
        <span>
          Zone <strong data-testid="zone-name">{ui.zoneName ?? 'Hallway'}</strong>
        </span>
      </div>
      <div className="status" data-testid="status" role="group" aria-label="Status">
        {STATUSES.map((status) => (
          <button
            key={status.id}
            type="button"
            data-testid={`status-${status.id}`}
            className={ui.status === status.id ? 'chip on' : 'chip'}
            aria-pressed={ui.status === status.id}
            onClick={() => session.setStatus(status.id)}
          >
            <StatusIcon
              frame={STATUS_FRAME[status.id]}
              testId={ui.status === status.id ? 'status-icon' : undefined}
            />
            {status.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="chip"
        data-testid="mute"
        aria-pressed={!ui.micEnabled}
        onClick={() => void session.setMicEnabled(!ui.micEnabled)}
      >
        {ui.micEnabled ? 'Mute' : 'Unmute'}
      </button>
      <button type="button" className="chip" data-testid="share-link" onClick={() => void copyLink()}>
        Copy link
      </button>
      <button type="button" className="chip" data-testid="leave" onClick={onLeave}>
        Leave
      </button>
      <p className="hint">WASD or arrows to walk. Click the floor to pathfind.</p>
      {ui.warning ? (
        <p className="warning" data-testid="mic-warning">
          {ui.warning}
        </p>
      ) : null}
    </header>
  )
}
