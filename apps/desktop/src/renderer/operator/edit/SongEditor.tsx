import { useState } from 'react'
import { newId, type Service, type SongEdit } from '@openstage/shared'
import { dispatch, useDocument } from '../engine'
import { ArrangementPanel } from './ArrangementPanel'
import { CommitField } from './CommitField'
import { SectionCard } from './SectionCard'
import { SongDetails } from './SongDetails'

interface SongEditorProps {
  songId: string
  service: Service
  isInService: boolean
  onDeleted: () => void
}

export function SongEditor({ songId, service, isInService, onDeleted }: SongEditorProps) {
  const { document: song, canUndo, canRedo, isLoaded } = useDocument('songs', songId)
  const [arrangementId, setArrangementId] = useState<string | null>(null)
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)

  if (!song) return <div className="editor-empty">{isLoaded ? 'This song is no longer in the library.' : 'Opening…'}</div>

  const edit = (change: SongEdit) => dispatch({ type: 'song.edit', songId, edit: change })
  const ref = { kind: 'songs', id: songId } as const
  const arrangement = song.arrangements.find((a) => a.id === arrangementId) ?? song.arrangements[0]!
  const used = arrangement.sectionIds.filter((id, index, all) => all.indexOf(id) === index && song.sections[id])
  const unused = Object.keys(song.sections).filter((id) => !used.includes(id))
  const slideCount = arrangement.sectionIds.reduce((sum, id) => sum + (song.sections[id]?.slides.length ?? 0), 0)

  const addSection = () => {
    const number = Object.values(song.sections).filter((s) => s.kind === 'verse').length + 1
    edit({ type: 'song.addSection', sectionId: newId('section'), kind: 'verse', label: `Verse ${number}`, arrangementId: arrangement.id })
  }

  return (
    <div className="song-editor">
      <div className="editor-content">
        <div className="editor-head">
          <div className="editor-title">
            <CommitField className="title-field" label="Song title" value={song.title} onCommit={(title) => edit({ type: 'song.setTitle', title })} />
            <span className="muted">
              {Object.keys(song.sections).length} sections · {slideCount} slides in “{arrangement.name}” · changes save automatically
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
                <button className="button-danger" onClick={() => (dispatch({ type: 'song.delete', songId }), onDeleted())}>
                  Delete “{song.title}”
                </button>
                <button className="button-quiet" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button
                className="button-quiet"
                disabled={isInService}
                title={isInService ? 'Remove it from the service first' : 'Moves the song to the library’s trash folder'}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            )}
            <button
              className="button-primary"
              disabled={!service.id}
              onClick={() => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.addSong', itemId: newId(song.title), songId } })}
            >
              {isInService ? 'Add again to service' : 'Add to service'}
            </button>
          </div>
        </div>

        <ArrangementPanel song={song} arrangement={arrangement} onSelect={setArrangementId} onEdit={edit} />

        <section className="section-cards" aria-label="Lyrics">
          {[...used, ...unused].map((id) => (
            <SectionCard key={id} song={song} section={song.sections[id]!} isUnused={unused.includes(id)} onEdit={edit} />
          ))}
          <button className="section-add" onClick={addSection}>
            + Add a section
          </button>
        </section>
      </div>
      <SongDetails song={song} arrangement={arrangement} onEdit={edit} />
    </div>
  )
}
