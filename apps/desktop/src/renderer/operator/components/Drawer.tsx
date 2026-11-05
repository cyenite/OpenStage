import { useState } from 'react'
import type { BackgroundRender, OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

const tabs = [
  { key: 'backgrounds', label: 'Backgrounds' },
  { key: 'lowerThirds', label: 'Lower thirds' },
  { key: 'audio', label: 'Audio' },
] as const

type TabKey = (typeof tabs)[number]['key']

export function Drawer({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [tab, setTab] = useState<TabKey>('backgrounds')
  const { library, state } = snapshot
  return (
    <section className="drawer" aria-label="Quick drawer">
      <div className="drawer-tabs" role="tablist" aria-label="Drawer">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="drawer-items" role="tabpanel">
        {tab === 'backgrounds' &&
          library.backgrounds.map((b) => (
            <DrawerTile
              key={b.id}
              name={b.name}
              swatch={swatch(b.render)}
              isActive={state.live.background === b.id}
              onPick={() => dispatch({ type: 'background.set', backgroundId: b.id })}
            />
          ))}
        {tab === 'lowerThirds' &&
          library.lowerThirds.map((l) => (
            <DrawerTile
              key={l.id}
              name={l.title}
              detail={l.subtitle}
              isActive={state.live.lowerThird === l.id}
              onPick={() => dispatch({ type: 'lowerThird.set', lowerThirdId: l.id })}
            />
          ))}
        {tab === 'audio' &&
          library.audioCues.map((a) => (
            <DrawerTile
              key={a.id}
              name={a.name}
              detail="Playback arrives in phase 3"
              isActive={state.live.audio === a.id}
              onPick={() => dispatch({ type: 'audio.set', audioCueId: a.id })}
            />
          ))}
      </div>
    </section>
  )
}

interface DrawerTileProps {
  name: string
  detail?: string
  swatch?: string
  isActive: boolean
  onPick: () => void
}

function DrawerTile({ name, detail, swatch, isActive, onPick }: DrawerTileProps) {
  return (
    <button className={`drawer-tile${isActive ? ' is-active' : ''}`} onClick={onPick} aria-pressed={isActive}>
      {swatch && <span className="drawer-swatch" style={{ background: swatch }} aria-hidden="true" />}
      <span className="drawer-name">{name}</span>
      {detail && <span className="drawer-detail">{detail}</span>}
    </button>
  )
}

function swatch(render: BackgroundRender): string {
  return render.kind === 'color' ? render.color : `linear-gradient(${render.angle}deg, ${render.from}, ${render.to})`
}
