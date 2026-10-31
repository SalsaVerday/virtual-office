import { useEffect, useState, type FormEvent } from 'react'
import { sanitizeName, sanitizeRoom, sanitizeVariant } from '../config'
import {
  SAFE_AREA,
  SPLASH_HEIGHT,
  SPLASH_WIDTH,
  fallbackPicker,
  parsePickerSheet,
  pickerCellStyle,
  splashImageUrl,
  splashScale,
  type PickerSheet,
} from './joinArt'

export type JoinInput = {
  displayName: string
  variant: string
  room: string
}

type Props = {
  providerId: string
  initialName: string
  initialVariant: string
  initialRoom: string
  busy: boolean
  error: string | null
  onJoin: (input: JoinInput) => void
}

const VARIANT_KEY = 'vo.variant'

function readStoredVariant(): string | null {
  try {
    return localStorage.getItem(VARIANT_KEY)
  } catch {
    return null
  }
}

/** Remember the avatar before join, and on an existing dev session, so a refresh keeps it. */
function persistVariant(variant: string): void {
  try {
    localStorage.setItem(VARIANT_KEY, variant)
    const raw = localStorage.getItem('vo.session')
    if (!raw) return
    const parsed = JSON.parse(raw) as { variant?: string }
    if (!parsed || typeof parsed !== 'object') return
    parsed.variant = variant
    localStorage.setItem('vo.session', JSON.stringify(parsed))
  } catch {
    // Private mode can block storage. The in-memory choice still joins.
  }
}

export function JoinScreen({
  providerId,
  initialName,
  initialVariant,
  initialRoom,
  busy,
  error,
  onJoin,
}: Props) {
  const [name, setName] = useState(initialName)
  const [room, setRoom] = useState(initialRoom)
  const [variant, setVariant] = useState(initialVariant || 'v00')
  const [sheet, setSheet] = useState<PickerSheet>(fallbackPicker)
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined' ? 2 : splashScale(window.innerWidth, window.innerHeight),
  )
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    setVariant(sanitizeVariant(initialVariant || readStoredVariant() || 'v00'))
  }, [initialVariant])

  useEffect(() => {
    const apply = () => setScale(splashScale(window.innerWidth, window.innerHeight))
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  useEffect(() => {
    void fetch('/assets/ui/avatar_picker.json')
      .then((response) => response.json())
      .then((body: unknown) => {
        const parsed = parsePickerSheet(body)
        if (parsed) setSheet(parsed)
      })
      .catch(() => {
        // The built-in 6×5 grid still addresses avatar_picker.png.
      })
  }, [])

  function choose(id: string) {
    const next = sanitizeVariant(id)
    setVariant(next)
    persistVariant(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    try {
      const chosen = sanitizeVariant(variant)
      persistVariant(chosen)
      onJoin({
        displayName: sanitizeName(name),
        variant: chosen,
        room: sanitizeRoom(room),
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Check the form and try again')
    }
  }

  const message = formError || error

  return (
    <main className="join">
      <form className="join-form" onSubmit={submit}>
        <div
          className="splash"
          data-scale={scale}
          style={{
            width: SPLASH_WIDTH * scale,
            height: SPLASH_HEIGHT * scale,
            backgroundImage: `url(${splashImageUrl(scale)})`,
          }}
        >
          <div
            className="safe"
            style={{
              left: SAFE_AREA.x * scale,
              top: SAFE_AREA.y * scale,
              width: SAFE_AREA.width * scale,
              height: SAFE_AREA.height * scale,
            }}
          >
            <h1 style={{ fontSize: 8 * scale }}>Join the floor</h1>
            <button
              className="primary"
              data-testid="join"
              type="submit"
              disabled={busy}
              style={{ fontSize: 6 * scale, padding: `${2 * scale}px ${4 * scale}px` }}
            >
              {busy ? 'Joining…' : 'Join office'}
            </button>
          </div>
        </div>
        <div className="join-panel">
          <p className="lede">Same link, same room. Walk up to someone to hear them. Meeting rooms are private.</p>
          <p className="auth-note" data-testid="auth-provider">
            {providerId === 'dev'
              ? 'Dev sign-in. Tests and staging use this name entry, not Microsoft SSO.'
              : 'Microsoft sign-in via Supabase Auth (Entra ID).'}
          </p>
          <label>
            Name
            <input
              data-testid="display-name"
              name="displayName"
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Room
            <input
              data-testid="room-name"
              name="room"
              maxLength={64}
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              spellCheck={false}
            />
          </label>
          <fieldset>
            <legend>Avatar</legend>
            <div className="avatar-grid" data-testid="avatar-picker">
              {sheet.cells.map((cell) => {
                const selected = cell.id === variant
                return (
                  <button
                    key={cell.id}
                    type="button"
                    className={selected ? 'avatar-option on' : 'avatar-option'}
                    data-testid={`avatar-option-${cell.id}`}
                    style={{
                      ...pickerCellStyle(sheet, cell),
                      backgroundImage: `url(/assets/ui/${sheet.image})`,
                    }}
                    aria-pressed={selected}
                    aria-label={cell.id}
                    onClick={() => choose(cell.id)}
                  >
                    <span data-testid={`variant-${cell.id}`} className="avatar-option-hit" />
                  </button>
                )
              })}
            </div>
          </fieldset>
          {message ? (
            <p className="error" data-testid="join-error" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </main>
  )
}
