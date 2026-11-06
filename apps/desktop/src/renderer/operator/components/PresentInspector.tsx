import { useEffect, useState } from 'react'
import { formatCountdown, itemKinds, stageLayouts, timerRemaining, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

const quickMessages = ['Wrap up', 'Chorus again', '5 minutes'] as const

/** The right-hand column of Present in the design: what is next, the clocks, and the stage screen. */
export function PresentInspector({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  return (
    <aside className="inspector present-inspector" aria-label="Inspector">
      <UpNext snapshot={snapshot} />
      <Timers snapshot={snapshot} now={now} />
      <StageMessage snapshot={snapshot} now={now} />
      <StageScreen snapshot={snapshot} />
    </aside>
  )
}

function UpNext({ snapshot }: { snapshot: OperatorSnapshot }) {
  const { service, decks, state } = snapshot
  const liveIndex = service.items.findIndex((i) => i.id === state.live.slide?.itemId)
  const next = decks[liveIndex + 1]
  if (!next) return null
  const badge = itemKinds.find((k) => k.key === next.kind)?.badge
  return (
    <div className="inspector-block">
      <span className="panel-title">Up next in the service</span>
      <button className="up-next" onClick={() => dispatch({ type: 'item.select', itemId: next.itemId })}>
        <span className="order-kind">{badge}</span>
        <span className="up-next-text">
          <strong>{next.title}</strong>
          <span className="muted">{next.isPlaceholder ? `${next.minutes} min` : `${next.slides.length} slides · ${next.minutes} min`}</span>
        </span>
      </button>
    </div>
  )
}

function Timers({ snapshot, now }: { snapshot: OperatorSnapshot; now: number }) {
  const { stage, timing } = snapshot.state
  const remaining = timerRemaining(stage.timer, now)
  const isRunning = stage.timer.endsAt !== null
  const sermon = snapshot.decks.find((d) => d.kind === 'sermon')
  const set = (label: string, minutes: number) => dispatch({ type: 'stage.timerSet', label, minutes })
  return (
    <div className="inspector-block">
      <span className="panel-title">Timers</span>
      <div className="timer-card">
        <span className="timer-cell">
          <span className="muted">Service clock</span>
          <span className="timer-value">{new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="muted">{timing.serviceStartedAt ? `${formatCountdown(now - timing.serviceStartedAt)} in` : 'Not started'}</span>
        </span>
        <span className="timer-cell is-countdown">
          <span className="muted">{stage.timer.label}</span>
          <span className={`timer-value${remaining < 0 ? ' is-over' : isRunning ? ' is-running' : ''}`}>{formatCountdown(remaining)}</span>
          <span className="timer-actions">
            <button className="button-quiet button-small" onClick={() => dispatch({ type: 'stage.timer', action: isRunning ? 'pause' : 'start' })}>
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button className="button-quiet button-small" onClick={() => dispatch({ type: 'stage.timer', action: 'reset' })}>
              Reset
            </button>
          </span>
        </span>
      </div>
      <div className="chip-row">
        <button className="chip-button" onClick={() => set('Countdown', 5)}>
          5 min
        </button>
        <button className="chip-button" onClick={() => set('Countdown', 10)}>
          10 min
        </button>
        {sermon && (
          <button className="chip-button" onClick={() => set(sermon.title, sermon.minutes)}>
            {sermon.title} {sermon.minutes} min
          </button>
        )}
      </div>
    </div>
  )
}

function StageMessage({ snapshot, now }: { snapshot: OperatorSnapshot; now: number }) {
  const [text, setText] = useState('')
  const current = snapshot.state.stage.message
  const send = (message: string) => {
    if (!message.trim()) return
    dispatch({ type: 'stage.message', text: message })
    setText('')
  }
  return (
    <div className="inspector-block">
      <label className="panel-title" htmlFor="stage-message">
        Message to stage
      </label>
      <div className="message-row">
        <input id="stage-message" value={text} placeholder="e.g. Repeat the chorus" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(text)} />
        <button className="button-small" onClick={() => send(text)} disabled={!text.trim()}>
          Send
        </button>
      </div>
      <div className="chip-row">
        {quickMessages.map((m) => (
          <button key={m} className="chip-button" onClick={() => send(m)}>
            {m}
          </button>
        ))}
      </div>
      {current && (
        <div className="current-message">
          <span>
            “{current.text}” <span className="muted">· {Math.max(0, Math.round((now - current.sentAt) / 1000))} s ago</span>
          </span>
          <button className="button-quiet button-small" onClick={() => dispatch({ type: 'stage.message', text: null })}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

function StageScreen({ snapshot }: { snapshot: OperatorSnapshot }) {
  const layout = snapshot.state.stage.layout
  return (
    <div className="inspector-block">
      <span className="panel-title">Stage screen</span>
      <div className="segmented" role="radiogroup" aria-label="Stage layout">
        {stageLayouts.map((l) => (
          <button key={l.key} role="radio" aria-checked={layout === l.key} aria-pressed={layout === l.key} title={l.detail} onClick={() => dispatch({ type: 'stage.layout', layout: l.key })}>
            {l.label}
          </button>
        ))}
      </div>
      <span className="inspector-note">{stageLayouts.find((l) => l.key === layout)!.detail}.</span>
      <span className="panel-title screens-title">Screens</span>
      <ul className="screens-list">
        {snapshot.outputs.map((o) => (
          <li key={o.id}>
            <span>{o.name}</span>
            <span className={o.isConnected ? 'is-on' : 'muted'}>{!o.isConnected ? 'Offline' : o.id === 'stage' ? stageLayouts.find((l) => l.key === layout)!.label : 'Lyrics and background'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
