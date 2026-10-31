import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createAuthProvider } from './auth'
import { roomFromLocation, sanitizeVariant } from './config'
import type { OfficeSession } from './net/session'
import { AdminScreen } from './ui/AdminScreen'
import { JoinScreen, type JoinInput } from './ui/JoinScreen'
const OfficeScreen = lazy(() => import('./ui/OfficeScreen').then((mod) => ({ default: mod.OfficeScreen })))

export function App() {
  const auth = useMemo(() => createAuthProvider(), [])
  const [session, setSession] = useState<OfficeSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialName, setInitialName] = useState('')
  const [initialVariant, setInitialVariant] = useState('v00')
  const initialRoom = roomFromLocation(window.location.search)
  const adminRoute = window.location.pathname === '/admin' || window.location.pathname === '/admin/'

  useEffect(() => {
    if (adminRoute) return
    void auth.getSession().then((user) => {
      if (user) {
        setInitialName(user.displayName)
        setInitialVariant(user.variant)
        return
      }
      try {
        const saved = localStorage.getItem('vo.variant')
        if (saved) setInitialVariant(sanitizeVariant(saved))
      } catch {
        // Storage can be blocked. The default avatar still joins.
      }
    })
  }, [auth, adminRoute])

  if (adminRoute) return <AdminScreen />

  async function join(input: JoinInput) {
    const audio = new AudioContext()
    void audio.resume()
    setBusy(true)
    setError(null)
    try {
      const user = await auth.signIn({ displayName: input.displayName, variant: input.variant })
      const { OfficeSession: Session } = await import('./net/session')
      const office = new Session(user, audio)
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

  return (
    <Suspense fallback={<p className="hint" data-testid="office-loading">Opening the office…</p>}>
      <OfficeScreen session={session} onLeave={() => void leave()} />
    </Suspense>
  )
}
