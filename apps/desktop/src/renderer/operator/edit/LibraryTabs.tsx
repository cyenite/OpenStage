export const editLibraries = [
  { key: 'songs', label: 'Songs' },
  { key: 'scripture', label: 'Scripture' },
  { key: 'slides', label: 'Slides' },
  { key: 'media', label: 'Media' },
  { key: 'themes', label: 'Themes' },
] as const

export type EditLibrary = (typeof editLibraries)[number]['key']

export function LibraryTabs({ library, onLibrary }: { library: EditLibrary; onLibrary: (library: EditLibrary) => void }) {
  return (
    <div className="segmented library-tabs" role="tablist" aria-label="Library">
      {editLibraries.map((l) => (
        <button key={l.key} role="tab" aria-selected={library === l.key} onClick={() => onLibrary(l.key)}>
          {l.label}
        </button>
      ))}
    </div>
  )
}
