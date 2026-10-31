import { useEffect, useMemo, useState } from 'react'
import { createAuthProvider } from './auth'
import { roomFromLocation } from './config'
import { OfficeSession } from './net/session'
import { JoinScreen, type JoinInput } from './ui/JoinScreen'
import { OfficeScreen } from './ui/OfficeScreen'

export function App() {
  const auth = useMemo(() => createAuthProvider(), [])
  const [session, setSession] = useState<OfficeSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialName, setInitialName] = useState('')
  const [initialVariant, setInitialVariant] = useState('v00')
  const initialRoom = roomFromLocation(window.location.search)

  useEffect(() => {
    void auth.getSession().then((user) => {
      if (!user) return
      setInitialName(user.displayName)
      setInitialVariant(user.variant)
    })
  }, [auth])

  async function join(input: JoinInput) {
    const audio = new AudioContext()
    void audio.resume()
    setBusy(true)
    setError(null)
    try {
      const user = await auth.signIn({ displayName: input.displayName, variant: input.variant })
      const office = new OfficeSession(user, audio)
      await office.connect(input.room)
      const url = new URL(window.location.href)
      url.searchParams.set('room', input.room)
      window.history.replaceState(null, '', url)
      setSession(office)
    } catch (err) {
      void audio.close()
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    const current = session
    setSession(null)
    await current?.close()
  }

  if (!session) {
    return (
      <JoinScreen
        providerId={auth.id}
        initialName={initialName}
        initialVariant={initialVariant}
        initialRoom={initialRoom}
        busy={busy}
        error={error}
        onJoin={(input) => void join(input)}
      />
    )
  }

  return <OfficeScreen session={session} onLeave={() => void leave()} />
}
