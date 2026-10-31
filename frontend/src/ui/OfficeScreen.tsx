import { useEffect, useRef, useSyncExternalStore } from 'react'
import { mountOffice } from '../game/createGame'
import type { OfficeSession } from '../net/session'
import { Hud } from './Hud'

type Props = {
  session: OfficeSession
  onLeave: () => void
}

export function OfficeScreen({ session, onLeave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const ui = useSyncExternalStore(session.subscribe, session.getUi, session.getUi)

  useEffect(() => {
    const parent = stageRef.current
    if (!parent) return
    const game = mountOffice(parent, session)
    return () => {
      game.destroy(true)
    }
  }, [session])

  const target = ui.knockTargets[0]

  return (
    <div className="app">
      <Hud ui={ui} session={session} onLeave={onLeave} />
      <div className="stage" ref={stageRef} data-testid="office-stage">
        {target ? (
          <div className="prompt" data-testid="knock-prompt">
            <span>{target.name} is focusing</span>
            <button type="button" data-testid="knock" onClick={() => session.knock(target.identity)}>
              Knock
            </button>
          </div>
        ) : null}
        {ui.incomingKnocks.map((knock) => (
          <div className="prompt incoming" data-testid="incoming-knock" key={knock.identity}>
            <span>{knock.name} knocked</span>
            <button type="button" data-testid="knock-accept" onClick={() => session.acceptKnock(knock.identity)}>
              Let them in
            </button>
          </div>
        ))}
        <aside className="roster" data-testid="roster">
          <h2>Here</h2>
          <ul>
            <li>
              {ui.displayName} <em>you</em>
            </li>
            {ui.peers.map((peer) => (
              <li key={peer.identity} data-testid={`participant-${peer.identity}`}>
                <span>{peer.name}</span>
                <span className="peer-meta">
                  {peer.zoneName ?? 'Hallway'}
                  {peer.gain > 0 ? ` · hear ${Math.round(peer.gain * 100)}%` : ''}
                  {peer.status === 'focus' ? ' · focus' : ''}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
