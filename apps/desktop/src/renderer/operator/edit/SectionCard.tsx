import type { CSSProperties } from 'react'
import { sectionKinds, sectionText, translationText, type Section, type SectionKind, type Song, type SongEdit } from '@openstage/shared'
import { CommitField } from './CommitField'
import { languageName } from './languages'

interface SectionCardProps {
  song: Song
  section: Section
  isUnused: boolean
  onEdit: (edit: SongEdit) => void
}

/** Main lines with inline chords, and each other language in its own column beside them. */
export function SectionCard({ song, section, isUnused, onEdit }: SectionCardProps) {
  const kind = sectionKinds.find((k) => k.key === section.kind)
  const [main, ...others] = song.languages
  const update = (change: Partial<Pick<Section, 'kind' | 'label'>>) =>
    onEdit({ type: 'song.updateSection', sectionId: section.id, kind: change.kind ?? section.kind, label: change.label ?? section.label })
  return (
    <article className={`section-card${isUnused ? ' is-unused' : ''}`} style={{ '--tint': kind?.color } as CSSProperties}>
      <header className="section-card-head">
        <CommitField className="section-label" label="Section name" value={section.label} onCommit={(label) => update({ label })} />
        <select aria-label={`Kind of ${section.label}`} value={section.kind} onChange={(e) => update({ kind: e.target.value as SectionKind })}>
          {sectionKinds
            .filter((k) => k.key !== 'scripture')
            .map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
        </select>
        <span className="muted">
          {section.slides.length === 1 ? '1 slide' : `${section.slides.length} slides`}
          {isUnused && ' · not in this arrangement'}
        </span>
        <button className="icon-button" aria-label={`Delete ${section.label}`} title="Delete section" onClick={() => onEdit({ type: 'song.removeSection', sectionId: section.id })}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </header>
      <div className="section-columns" style={{ '--columns': song.languages.length } as CSSProperties}>
        <label className="lyric-column">
          <span className="column-label">{languageName(main ?? 'en')}</span>
          <CommitField
            isMultiline
            lang={main}
            className="lyrics-field"
            label={`${section.label} lyrics`}
            placeholder="Lyrics. A blank line starts the next slide."
            value={sectionText(section.slides)}
            onCommit={(text) => onEdit({ type: 'song.setSectionText', sectionId: section.id, language: null, text })}
          />
        </label>
        {others.map((language) => (
          <label key={language} className="lyric-column">
            <span className="column-label">{languageName(language)}</span>
            <CommitField
              isMultiline
              lang={language}
              className="lyrics-field"
              label={`${section.label} in ${languageName(language)}`}
              placeholder="Same slides, same order. Leave a slide empty with an extra blank line."
              value={translationText(section.slides, language)}
              onCommit={(text) => onEdit({ type: 'song.setSectionText', sectionId: section.id, language, text })}
            />
          </label>
        ))}
      </div>
    </article>
  )
}
