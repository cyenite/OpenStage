import { useEffect, useRef, useState } from 'react'
import type { BibleInfo, ImportDecision, ImportItem, ImportPlan, ImportReport } from '@openstage/shared'
import { ask } from '../engine'
import { commonLanguages } from './languages'

interface ImportDialogProps {
  files: File[]
  installedBibles: string[]
  onClose: () => void
}

type Stage = { kind: 'reading' } | { kind: 'choosing'; plan: ImportPlan } | { kind: 'importing' } | { kind: 'done'; report: ImportReport }

const duplicateChoices = [
  { key: 'skip', label: 'Skip it' },
  { key: 'merge', label: 'Merge: keep our lyrics, fill missing details' },
  { key: 'keepBoth', label: 'Keep both' },
] as const satisfies readonly { key: ImportDecision; label: string }[]

const statusLabels = { new: 'New', duplicate: 'Already here', unreadable: 'Can’t read' } as const

/**
 * Import never overwrites anything on its own: it reads the files, shows what it found and what
 * already exists, and only acts on the choices made here.
 */
export function ImportDialog({ files, installedBibles, onClose }: ImportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'reading' })
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>({})
  const [bibles, setBibles] = useState<Record<string, BibleInfo>>({})
  const [rights, setRights] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
    void Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))).then(async (read) => {
      const result = await ask({ type: 'import.preview', files: read })
      if (result.type !== 'importPlan') return
      setDecisions(Object.fromEntries(result.plan.items.map((i) => [i.key, i.status === 'new' ? 'add' : 'skip'])))
      setBibles(Object.fromEntries(result.plan.items.flatMap((i) => (i.bible ? [[i.key, { code: i.bible.code, name: i.bible.name, language: i.bible.language, notice: i.bible.notice }]] : []))))
      setStage({ kind: 'choosing', plan: result.plan })
    })
  }, [files])

  const apply = async (plan: ImportPlan) => {
    setStage({ kind: 'importing' })
    const result = await ask({ type: 'import.apply', importId: plan.importId, decisions, bibles })
    if (result.type === 'importReport') setStage({ kind: 'done', report: result.report })
  }

  const plan = stage.kind === 'choosing' ? stage.plan : null
  const count = (status: ImportItem['status']) => plan?.items.filter((i) => i.status === status).length ?? 0
  const hasBible = !!plan?.items.some((i) => i.bible && decisions[i.key] === 'add')
  const chosen = plan?.items.filter((i) => decisions[i.key] && decisions[i.key] !== 'skip').length ?? 0

  return (
    <dialog ref={dialog} className="dialog import-dialog" aria-labelledby="import-title" onClose={onClose}>
      <div className="import-body">
        <h2 id="import-title">Import</h2>
        {stage.kind === 'reading' && <p className="muted">Reading {files.length === 1 ? files[0]!.name : `${files.length} files`}…</p>}
        {stage.kind === 'importing' && <p className="muted">Importing…</p>}
        {plan && (
          <>
            <p className="import-summary">
              {count('new')} new · {count('duplicate')} already here · {count('unreadable')} can’t be read
            </p>
            <ul className="import-list">
              {plan.items.map((item) => (
                <ImportRow
                  key={item.key}
                  item={item}
                  decision={decisions[item.key] ?? 'skip'}
                  bible={bibles[item.key]}
                  installedBibles={installedBibles}
                  onDecision={(d) => setDecisions((all) => ({ ...all, [item.key]: d }))}
                  onBible={(info) => setBibles((all) => ({ ...all, [item.key]: info }))}
                />
              ))}
            </ul>
            {hasBible && (
              <label className="check rights">
                <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
                Our church has the right to use the Bible text being imported, and its notice is filled in above.
              </label>
            )}
          </>
        )}
        {stage.kind === 'done' && <ReportView report={stage.report} />}
      </div>
      <div className="dialog-actions">
        {stage.kind === 'done' ? (
          <button className="button-primary" onClick={() => dialog.current?.close()}>
            Done
          </button>
        ) : (
          <>
            <button className="button-quiet" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button className="button-primary" disabled={!plan || chosen === 0 || (hasBible && !rights)} onClick={() => plan && apply(plan)}>
              Import {chosen || ''}
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}

interface ImportRowProps {
  item: ImportItem
  decision: ImportDecision
  bible: BibleInfo | undefined
  installedBibles: string[]
  onDecision: (decision: ImportDecision) => void
  onBible: (info: BibleInfo) => void
}

function ImportRow({ item, decision, bible, installedBibles, onDecision, onBible }: ImportRowProps) {
  const [isComparing, setComparing] = useState(false)
  const isTaken = !!bible && installedBibles.includes(bible.code)
  return (
    <li className={`import-row is-${item.status}`}>
      <div className="import-row-head">
        <span className={`import-status is-${item.status}`}>{statusLabels[item.status]}</span>
        <span className="import-title">
          <strong>{item.title}</strong>
          <span className="muted">
            {item.kind === 'bible' ? 'Bible' : 'Song'} · {item.format} · {item.file.replace(/^.*\//, '')}
          </span>
        </span>
        {item.status === 'new' && (
          <label className="check">
            <input type="checkbox" checked={decision === 'add'} onChange={(e) => onDecision(e.target.checked ? 'add' : 'skip')} />
            Import
          </label>
        )}
        {item.status === 'duplicate' && item.kind === 'song' && (
          <>
            <select aria-label={`What to do with ${item.title}`} value={decision} onChange={(e) => onDecision(e.target.value as ImportDecision)}>
              {duplicateChoices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button className="button-quiet button-small" aria-pressed={isComparing} onClick={() => setComparing(!isComparing)}>
              Compare
            </button>
          </>
        )}
        {item.status === 'duplicate' && item.kind === 'bible' && (
          <label className="check">
            <input type="checkbox" checked={decision === 'add'} onChange={(e) => onDecision(e.target.checked ? 'add' : 'skip')} />
            Import under another code
          </label>
        )}
      </div>
      {item.reason && <p className={`import-reason${item.status === 'unreadable' ? ' is-error' : ''}`}>{item.reason}</p>}
      {isComparing && item.existing && (
        <div className="compare">
          <div>
            <span className="panel-title">In your library</span>
            {item.existing.preview.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div>
            <span className="panel-title">In the file</span>
            {item.preview.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}
      {item.bible && bible && decision === 'add' && (
        <div className="bible-fields">
          <span className="muted">
            {item.bible.books} books · {item.bible.verses.toLocaleString()} verses
          </span>
          <label className="field">
            <span>Code</span>
            <input value={bible.code} aria-invalid={isTaken} onChange={(e) => onBible({ ...bible, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) })} />
            {isTaken && <small className="import-reason is-error">This code is in use; choose another.</small>}
          </label>
          <label className="field">
            <span>Name</span>
            <input value={bible.name} onChange={(e) => onBible({ ...bible, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Language</span>
            <select value={bible.language} onChange={(e) => onBible({ ...bible, language: e.target.value })}>
              {!commonLanguages.some((l) => l.code === bible.language) && <option value={bible.language}>{bible.language}</option>}
              {commonLanguages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field bible-notice">
            <span>Copyright notice (shown with the text)</span>
            <textarea rows={2} value={bible.notice} onChange={(e) => onBible({ ...bible, notice: e.target.value })} />
          </label>
        </div>
      )}
    </li>
  )
}

function ReportView({ report }: { report: ImportReport }) {
  const groups = [
    { label: 'Added', items: report.added },
    { label: 'Merged', items: report.merged },
    { label: 'Skipped', items: report.skipped },
  ]
  return (
    <div className="import-report">
      <p className="import-summary">
        {report.added.length} added · {report.merged.length} merged · {report.skipped.length} skipped · {report.failed.length} could not be imported
      </p>
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.label}>
            <span className="panel-title">{g.label}</span>
            <p>{g.items.join(', ')}</p>
          </div>
        ))}
      {report.failed.length > 0 && (
        <div>
          <span className="panel-title">Could not be imported</span>
          <ul>
            {report.failed.map((f, i) => (
              <li key={i}>
                <strong>{f.title}</strong>: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
