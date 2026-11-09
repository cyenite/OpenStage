import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { newId, parseLyrics, sectionKinds } from '@openstage/shared'
import { dispatch } from '../engine'
import { commonLanguages } from './languages'

interface NewSongDialogProps {
  onClose: () => void
  onCreated: (songId: string) => void
}

/** The paste-lyrics fast path: blank lines split slides, headings such as [Chorus] start sections. */
export function NewSongDialog({ onClose, onCreated }: NewSongDialogProps) {
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [language, setLanguage] = useState('en')
  const dialog = useRef<HTMLDialogElement>(null)
  const parsed = parseLyrics(lyrics)
  const slideCount = parsed.order.reduce((sum, index) => sum + parsed.sections[index]!.slides.length, 0)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const create = () => {
    const songId = newId(title || 'song')
    dispatch({ type: 'song.create', songId, title, lyrics, language })
    onCreated(songId)
  }

  return (
    <dialog ref={dialog} className="dialog new-song" aria-labelledby="new-song-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2 id="new-song-title">New song</h2>
        <div className="dialog-row">
          <label className="field">
            <span>Title</span>
            <input autoFocus value={title} placeholder="Amazing Grace" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field field-narrow">
            <span>Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {commonLanguages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dialog-columns">
          <label className="field">
            <span>Lyrics</span>
            <textarea
              value={lyrics}
              rows={16}
              spellCheck
              placeholder={'[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n…'}
              onChange={(e) => setLyrics(e.target.value)}
            />
            <small>Blank lines split slides. Headings like [Chorus], Verse 2: or Kiitikio start sections. Chords can be inline, [G]like this, or on the line above.</small>
          </label>
          <div className="parse-preview" aria-live="polite">
            <span className="panel-title">
              {parsed.sections.length} sections · {slideCount} slides
            </span>
            <ol>
              {parsed.order.map((index, position) => {
                const section = parsed.sections[index]!
                const color = sectionKinds.find((k) => k.key === section.kind)?.color
                return (
                  <li key={position} style={{ '--tint': color } as CSSProperties}>
                    <strong>{section.label}</strong>
                    <span>{section.slides.length === 1 ? '1 slide' : `${section.slides.length} slides`}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button-quiet" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={!title.trim()}>
            Create song
          </button>
        </div>
      </form>
    </dialog>
  )
}
