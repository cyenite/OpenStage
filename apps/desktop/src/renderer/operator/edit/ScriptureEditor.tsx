import { useState } from 'react'
import { formatReference, type BibleInfo, type Id, type PassageEdit, type Service } from '@openstage/shared'
import { dispatch, useDocument, useScriptureSlides } from '../engine'
import { AddToService } from './AddToService'
import { ReferenceInput } from './ReferenceInput'

interface ScriptureEditorProps {
  bibles: BibleInfo[]
  service: Service
  revision: number
  passageId: Id
  onDeleted: () => void
}

const versesPerSlideChoices = [1, 2, 3, 4] as const

export function ScriptureEditor({ bibles, service, revision, passageId, onDeleted }: ScriptureEditorProps) {
  const { document: passage, canUndo, canRedo, isLoaded } = useDocument('passages', passageId)
  const slides = useScriptureSlides(passageId, revision)
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)
  if (!passage) return <div className="editor-empty">{isLoaded ? 'This passage is no longer in the library.' : 'Opening…'}</div>

  const edit = (change: PassageEdit) => dispatch({ type: 'passage.edit', passageId, edit: change })
  const ref = { kind: 'passages', id: passageId } as const
  const isInService = service.items.some((i) => i.type === 'scripture' && i.passageId === passageId)
  const chosen = passage.translations
  const available = bibles.filter((b) => !chosen.includes(b.code))
  const setTranslations = (translations: string[]) => translations.length > 0 && edit({ type: 'passage.setTranslations', translations })
  const move = (index: number) => setTranslations(chosen.toSpliced(index - 1, 2, chosen[index]!, chosen[index - 1]!))

  return (
    <div className="song-editor scripture-editor">
      <div className="editor-content">
        <div className="editor-head">
          <div className="editor-title">
            <h1 className="passage-title">{formatReference(passage.ref)}</h1>
            <span className="muted">
              {slides.length === 1 ? '1 slide' : `${slides.length} slides`} · {chosen.join(' with ')} underneath · the words come from the installed Bibles
            </span>
          </div>
          <div className="editor-actions">
            <button className="icon-button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => dispatch({ type: 'document.undo', ref })}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>
            </button>
            <button className="icon-button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => dispatch({ type: 'document.redo', ref })}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></svg>
            </button>
            {isConfirmingDelete ? (
              <>
                <button className="button-danger" onClick={() => (dispatch({ type: 'passage.delete', passageId }), onDeleted())}>
                  Delete passage
                </button>
                <button className="button-quiet" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button className="button-quiet" disabled={isInService} title={isInService ? 'Remove it from the service first' : undefined} onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
            <AddToService service={service} isInService={isInService} kind="scripture" onAdd={(itemId) => ({ type: 'service.addPassage', itemId, passageId })} onFill={(itemId) => ({ type: 'service.fillSlot', itemId, passageId })} />
          </div>
        </div>

        <ReferenceInput
          className="passage-reference"
          label="Change the passage"
          placeholder="Change to another reference, like 1 kor 13 4-7"
          onSubmit={(next) => edit({ type: 'passage.setRef', ref: next })}
        />

        <section className="slide-list" aria-label="Slides">
          {slides.map((slide, index) => (
            <article key={index} className="verse-row">
              <span className="verse-label">{slide.label.replace(/^Verses? /, '')}</span>
              <div className="verse-texts">
                <p className="verse-main">{slide.lines.join(' ')}</p>
                {slide.secondaryLines.length > 0 && <p className="verse-secondary">{slide.secondaryLines.join(' ')}</p>}
              </div>
              <span className="muted">Slide {index + 1}</span>
            </article>
          ))}
          {slides.length === 0 && <p className="muted">No verses: this reference is past the end of the chapter, or no chosen Bible is installed.</p>}
        </section>
      </div>

      <aside className="inspector" aria-label="Passage settings">
        <div className="inspector-block">
          <span className="panel-title">Translations, in order</span>
          <ol className="translation-list">
            {chosen.map((code, index) => {
              const bible = bibles.find((b) => b.code === code)
              return (
                <li key={code}>
                  <span>
                    <strong>{code}</strong> <span className="muted">{bible ? (index === 0 ? 'main lines' : index === 1 ? 'underneath' : 'not shown, only two fit') : 'not installed'}</span>
                  </span>
                  <span className="translation-actions">
                    {index > 0 && (
                      <button className="icon-button" aria-label={`Move ${code} up`} onClick={() => move(index)}>
                        ↑
                      </button>
                    )}
                    {chosen.length > 1 && (
                      <button className="icon-button" aria-label={`Remove ${code}`} onClick={() => setTranslations(chosen.filter((c) => c !== code))}>
                        ×
                      </button>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
          {available.length > 0 && (
            <select aria-label="Add a translation" value="" onChange={(e) => e.target.value && setTranslations([...chosen, e.target.value])}>
              <option value="">+ Add a translation</option>
              {available.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="inspector-block">
          <span className="panel-title">Slides</span>
          <div className="field-row">
            <span className="field-row-label">Verses per slide</span>
            <div className="segmented" role="radiogroup" aria-label="Verses per slide">
              {versesPerSlideChoices.map((n) => (
                <button key={n} role="radio" aria-checked={passage.versesPerSlide === n} aria-pressed={passage.versesPerSlide === n} onClick={() => edit({ type: 'passage.setVersesPerSlide', versesPerSlide: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="check field-row">
            <span className="field-row-label">Split long verses (5a, 5b)</span>
            <input type="checkbox" checked={passage.splitLong} onChange={(e) => edit({ type: 'passage.setSplitLong', splitLong: e.target.checked })} />
          </label>
          <span className="inspector-note">Long verses split at the same places in both languages, so the lines stay together.</span>
        </div>

        <div className="inspector-block">
          <span className="panel-title">Notices</span>
          {chosen.map((code) => (
            <p key={code} className="inspector-note">
              {bibles.find((b) => b.code === code)?.notice ?? `${code} is not installed on this computer.`}
            </p>
          ))}
        </div>
      </aside>
    </div>
  )
}
