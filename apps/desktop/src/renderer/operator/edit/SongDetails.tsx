import { useState, type ReactNode } from 'react'
import { classicTheme, lookup, type Arrangement, type DeckSlide, type Id, type Service, type Song, type SongEdit, type Theme } from '@openstage/shared'
import { RenderView } from '../components/RenderView'
import { CommitField } from './CommitField'
import { commonLanguages, languageName } from './languages'
import { previewBackground, previewRender } from './preview'
import { ThemePicker } from './ThemePicker'

interface SongDetailsProps {
  song: Song
  themes: Theme[]
  service: Service
  arrangement: Arrangement
  onEdit: (edit: SongEdit) => void
  onOpenTheme: (themeId: Id) => void
}

export function SongDetails({ song, themes, service, arrangement, onEdit, onOpenTheme }: SongDetailsProps) {
  const [newLanguage, setNewLanguage] = useState('')
  const first = song.sections[arrangement.sectionIds[0] ?? '']?.slides[0]
  const secondary = song.languages[1]
  const byId = Object.fromEntries(themes.map((t) => [t.id, t]))
  const theme = lookup(byId, song.themeId) ?? lookup(byId, service.themeId) ?? lookup(byId, classicTheme.id) ?? classicTheme
  const slide: DeckSlide = {
    kind: 'verse',
    label: '',
    reference: '',
    lines: first?.lines.map((l) => l.text) ?? ['No lyrics yet'],
    secondaryLines: secondary ? first?.translations?.[secondary] ?? [] : [],
  }
  const setLanguages = (languages: string[]) => onEdit({ type: 'song.setLanguages', languages })
  const addLanguage = (code: string) => {
    const cleaned = code.trim().toLowerCase()
    setNewLanguage('')
    if (cleaned && !song.languages.includes(cleaned)) setLanguages([...song.languages, cleaned])
  }

  return (
    <aside className="inspector" aria-label="Song details">
      <div className="inspector-block">
        <span className="panel-title">How it looks on screen</span>
        <RenderView className="screen-preview" render={previewRender(theme, slide, previewBackground)} />
      </div>

      <ThemePicker themes={themes} themeId={song.themeId} serviceThemeId={service.themeId} onPick={(themeId) => onEdit({ type: 'song.setTheme', themeId })} onOpenTheme={onOpenTheme} />

      <div className="inspector-block">
        <span className="panel-title">Details</span>
        <dl className="detail-list">
          <DetailRow label="Authors">
            <CommitField label="Authors, separated by commas" value={song.meta.authors.join(', ')} placeholder="Add" onCommit={(text) => onEdit({ type: 'song.setMeta', meta: { authors: text.split(',').map((a) => a.trim()).filter(Boolean) } })} />
          </DetailRow>
          <DetailRow label="Copyright">
            <CommitField label="Copyright" value={song.meta.copyright} placeholder="Add" onCommit={(copyright) => onEdit({ type: 'song.setMeta', meta: { copyright } })} />
          </DetailRow>
          <DetailRow label="CCLI song number">
            <CommitField label="CCLI song number" value={song.meta.ccli ?? ''} placeholder="Not needed" onCommit={(ccli) => onEdit({ type: 'song.setMeta', meta: { ccli } })} />
          </DetailRow>
          <DetailRow label="Key">
            <div className="key-row">
              <button className="icon-button" aria-label="Transpose down a semitone" onClick={() => onEdit({ type: 'song.transpose', semitones: -1 })}>
                −
              </button>
              <CommitField label="Key" value={song.meta.key ?? ''} placeholder="Add" onCommit={(key) => onEdit({ type: 'song.setMeta', meta: { key: key.trim() } })} />
              <button className="icon-button" aria-label="Transpose up a semitone" onClick={() => onEdit({ type: 'song.transpose', semitones: 1 })}>
                +
              </button>
            </div>
          </DetailRow>
          <DetailRow label="Tempo">
            <CommitField
              label="Tempo in beats per minute"
              value={song.meta.tempo ? String(song.meta.tempo) : ''}
              placeholder="BPM"
              onCommit={(text) => Number(text) > 0 && onEdit({ type: 'song.setMeta', meta: { tempo: Number(text) } })}
            />
          </DetailRow>
        </dl>
      </div>

      <div className="inspector-block">
        <span className="panel-title">Languages</span>
        <ul className="language-list">
          {song.languages.map((code, index) => (
            <li key={code}>
              <span>
                {languageName(code)} <span className="muted">{index === 0 ? 'main lines' : 'shown under the main lines'}</span>
              </span>
              {index > 0 && (
                <button className="icon-button" aria-label={`Remove ${languageName(code)}`} title="Remove this language and its lines" onClick={() => setLanguages(song.languages.filter((l) => l !== code))}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <select aria-label="Add a language" value={newLanguage} onChange={(e) => addLanguage(e.target.value)}>
          <option value="">+ Add a second language</option>
          {commonLanguages
            .filter((l) => !song.languages.includes(l.code))
            .map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
        </select>
      </div>
    </aside>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
