import { useState, type ReactNode } from 'react'

/** Lets files be dropped onto a library, as the design's "Drop ProPresenter, EasyWorship, OpenLyrics or ChordPro files here". */
export function DropZone({ hint, onFiles, children }: { hint: string; onFiles: (files: File[]) => void; children: ReactNode }) {
  const [isOver, setOver] = useState(false)
  return (
    <div
      className={`drop-zone${isOver ? ' is-over' : ''}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files])
      }}
    >
      {children}
      <div className="drop-hint">{hint}</div>
    </div>
  )
}

/** A button that opens the file picker; the files go to the same import as a drop. */
export function ImportButton({ label, accept, onFiles }: { label: string; accept: string; onFiles: (files: File[]) => void }) {
  return (
    <label className="button-quiet button-small import-button">
      {label}
      <input
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files])
          e.target.value = ''
        }}
      />
    </label>
  )
}
