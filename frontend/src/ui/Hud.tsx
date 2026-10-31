import { useEffect, useState } from 'react'
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

type DeviceOption = { deviceId: string; label: string }

export function Hud({ ui, session, onLeave }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mics, setMics] = useState<DeviceOption[]>([])
  const [speakers, setSpeakers] = useState<DeviceOption[]>([])
  const saved = session.deviceIds()

  useEffect(() => {
    if (!settingsOpen) return
    let cancel = false
    void session.listDevices().then((devices) => {
      if (cancel) return
      setMics(devices.mics)
      setSpeakers(devices.speakers)
    })
    return () => {
      cancel = true
    }
  }, [session, settingsOpen])

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
      <button
        type="button"
        className={settingsOpen ? 'chip on' : 'chip'}
        data-testid="settings"
        aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        Settings
      </button>
      <button type="button" className="chip" data-testid="share-link" onClick={() => void copyLink()}>
        Copy link
      </button>
      <button type="button" className="chip" data-testid="leave" onClick={onLeave}>
        Leave
      </button>
      <p className="hint">WASD or arrows to walk. Click the floor to pathfind.</p>
      {ui.link !== 'connected' ? (
        <p className="warning" data-testid="connection-status" role="status">
          {ui.link === 'offline' ? 'Offline. Could not rejoin.' : 'Reconnecting…'}
        </p>
      ) : null}
      {ui.warning ? (
        <p className="warning" data-testid="mic-warning">
          {ui.warning}
        </p>
      ) : null}
      {settingsOpen ? (
        <div className="settings" data-testid="settings-panel">
          <label>
            Microphone
            <select
              data-testid="mic-device"
              value={saved.micId}
              onChange={(event) => void session.setInputDevice(event.target.value)}
            >
              <option value="">System default</option>
              {mics.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speaker
            <select
              data-testid="speaker-device"
              value={saved.speakerId}
              onChange={(event) => void session.setOutputDevice(event.target.value)}
            >
              <option value="">System default</option>
              {speakers.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </header>
  )
}
