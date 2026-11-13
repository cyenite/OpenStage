import { useState } from 'react'
import type { OperatorSnapshot, SlideRef } from '@openstage/shared'
import type { WindowState } from '../../../chrome'
import { LockIcon, RehearseButton, WindowChrome } from '../components/TitleBar'
import { RenderView } from '../components/RenderView'
import { dispatch } from '../engine'
import { UnlockDialog } from './PinDialogs'

interface VolunteerScreenProps {
  snapshot: OperatorSnapshot
  windowState: WindowState
}

/** The design's Volunteer board: the service, what is on screen, what comes next, and three big buttons. */
export function VolunteerScreen({ snapshot, windowState }: VolunteerScreenProps) {
  const [isUnlocking, setUnlocking] = useState(false)
  const [cleared, setCleared] = useState<SlideRef | null>(null)
  const { service, decks, state } = snapshot
  const live = state.live.slide
  const liveDeck = decks.find((d) => d.itemId === live?.itemId)
  const liveIndex = service.items.findIndex((i) => i.id === live?.itemId)
  const next = state.preview ? decks.find((d) => d.itemId === state.preview!.itemId)?.slides[state.preview.index] : undefined
  const nextDeck = decks.find((d) => d.itemId === state.preview?.itemId)
  const clearLabel = liveDeck?.kind === 'song' ? 'Clear the lyrics' : liveDeck?.kind === 'scripture' ? 'Clear the verse' : 'Clear the screen'

  const clear = () => {
    if (live) {
      setCleared(live)
      dispatch({ type: 'layer.clear', layer: 'slide' })
    } else if (cleared) {
      dispatch({ type: 'preview.set', ref: cleared })
      dispatch({ type: 'live.take' })
      setCleared(null)
    }
  }

  return (
    <>
      <header className="titlebar volunteer-titlebar">
        <WindowChrome windowState={windowState} />
        <span className="volunteer-name">
          <LockIcon />
          Volunteer mode
        </span>
        <span className="titlebar-subtitle">{service.name}</span>
        <span className="titlebar-spacer" />
        <RehearseButton isRehearsing={snapshot.mode.isRehearsing} />
        <button className="button-quiet button-small" onClick={() => setUnlocking(true)}>
          Unlock full app with PIN
        </button>
      </header>
      <nav className="sidebar volunteer-order" aria-label="Service">
        <h2 className="panel-title">Today</h2>
        <ol>
          {service.items.map((item, index) => {
            const deck = decks.find((d) => d.itemId === item.id)
            const state = index === liveIndex ? 'live' : liveIndex >= 0 && index < liveIndex ? 'done' : ''
            return (
              <li key={item.id}>
                <button className={`volunteer-item is-${state || 'upcoming'}`} disabled={deck?.isPlaceholder} onClick={() => dispatch({ type: 'item.select', itemId: item.id })}>
                  <span className="volunteer-dot" aria-hidden="true" />
                  {deck?.title}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <main className="main volunteer-main">
        <section className={`volunteer-now${snapshot.mode.isRehearsing ? ' is-rehearsing' : ''}`} aria-label="On the screen now">
          <span className="volunteer-label is-live">
            <span className="dot" aria-hidden="true" />
            {snapshot.mode.isRehearsing ? 'REHEARSING · NOT ON THE SCREENS' : 'ON THE SCREEN NOW'}
          </span>
          <RenderView className="volunteer-screen" render={snapshot.liveRender} />
          <span className="muted">
            {live && liveDeck ? `${liveDeck.title} · ${liveDeck.slides[live.index]?.label} · slide ${live.index + 1} of ${liveDeck.slides.length}` : 'Nothing is showing'}
          </span>
        </section>
        <section className="volunteer-next" aria-label="Coming next">
          <span className="volunteer-label">COMING NEXT</span>
          <div className="volunteer-next-card">
            <span className="volunteer-next-text">{next ? next.lines.join('\n') : 'The end of the service'}</span>
            {next && nextDeck && (
              <span className="muted">
                {nextDeck.title} · {next.label}
              </span>
            )}
          </div>
        </section>
        <div className="volunteer-buttons">
          <button className="volunteer-back" onClick={() => dispatch({ type: 'live.previous' })} disabled={!live}>
            ‹ Back
          </button>
          <button className="volunteer-go" onClick={() => dispatch({ type: 'live.next' })} disabled={!next && !!live}>
            Next slide ›
          </button>
          <button className="volunteer-clear" onClick={clear} disabled={!live && !cleared}>
            {live || !cleared ? clearLabel : 'Show again'}
          </button>
        </div>
        <span className="muted volunteer-note">Clicker, space bar and arrow keys also work. Anything else is locked so nothing can be deleted by accident.</span>
      </main>
      {isUnlocking && <UnlockDialog onClose={() => setUnlocking(false)} />}
    </>
  )
}
