import { useEffect, useRef, useSyncExternalStore } from 'react'
import { mountOffice } from '../game/createGame'
import type { OfficeSession } from '../net/session'
import { Hud } from './Hud'
import { StatusIcon } from './StatusIcon'

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
            <StatusIcon frame={4} testId="knock-icon" />
            <span>{target.name} is focusing</span>
            <button type="button" className="chip" data-testid="knock" onClick={() => session.knock(target.identity)}>
              Knock
            </button>
          </div>
        ) : null}
        {ui.incomingKnocks.map((knock) => (
          <div className="prompt incoming" data-testid="incoming-knock" key={knock.identity}>
            <StatusIcon frame={4} />
            <span>{knock.name} knocked</span>
            <button type="button" className="chip" data-testid="knock-accept" onClick={() => session.acceptKnock(knock.identity)}>
              Let them in
            </button>
            <button type="button" className="chip" data-testid="knock-ignore" onClick={() => session.ignoreKnock(knock.identity)}>
              Ignore
            </button>
          </div>
        ))}
        <aside className="roster" data-testid="roster">
          <h2>Here</h2>
          <ul>
            <li>
              <span className="who">
                <StatusIcon frame={ui.status === 'online' ? 0 : ui.status === 'away' ? 1 : 2} small />
                {ui.displayName} <em>you</em>
              </span>
            </li>
            {ui.peers.map((peer) => (
              <li key={peer.identity} data-testid={`participant-${peer.identity}`}>
                <span className="who">
                  <StatusIcon
                    frame={peer.talking ? 3 : peer.status === 'away' ? 1 : peer.status === 'focus' ? 2 : 0}
                    small
                  />
                  {peer.name}
                </span>
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
