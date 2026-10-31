import { useEffect, useState, type FormEvent } from 'react'
import { sanitizeName, sanitizeRoom, sanitizeVariant } from '../config'
import { paletteHex } from '../palette'
import { AVATAR_VARIANTS } from '../game/variants'

type VariantInfo = { id: string; shirt: string; hair: string }

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
  const [variants, setVariants] = useState<VariantInfo[]>(
    AVATAR_VARIANTS.map((id) => ({ id, shirt: 'metal', hair: 'shadow' })),
  )
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    void fetch('/assets/sprites/variants.json')
      .then((response) => response.json())
      .then((body: VariantInfo[]) => {
        if (Array.isArray(body) && body.length > 0) setVariants(body)
      })
      .catch(() => {
        // The built-in v00–v29 list still works if the json fails to parse.
      })
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    try {
      onJoin({
        displayName: sanitizeName(name),
        variant: sanitizeVariant(variant),
        room: sanitizeRoom(room),
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Check the form and try again')
    }
  }

  const message = formError || error

  return (
    <main className="join">
      <form className="card" onSubmit={submit}>
        <p className="eyebrow">Virtual office</p>
        <h1>Join the floor</h1>
        <p className="lede">
          Same link, same room. Walk up to someone to hear them. Meeting rooms are private.
        </p>
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
          <legend>Color</legend>
          <div className="variants" data-testid="variant-picker">
            {variants.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`variant-${item.id}`}
                className={item.id === variant ? 'swatch selected' : 'swatch'}
                style={{ background: paletteHex(item.shirt) }}
                aria-pressed={item.id === variant}
                title={`${item.id} · ${item.shirt} / ${item.hair}`}
                onClick={() => setVariant(item.id)}
              />
            ))}
          </div>
        </fieldset>
        {message ? (
          <p className="error" data-testid="join-error" role="alert">
            {message}
          </p>
        ) : null}
        <button className="primary" data-testid="join" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join office'}
        </button>
      </form>
    </main>
  )
}
