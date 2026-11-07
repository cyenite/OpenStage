import type { LibraryFilter } from './results'

interface FilterChipsProps {
  filters: readonly { key: LibraryFilter; label: string }[]
  filter: LibraryFilter
  onFilter: (filter: LibraryFilter) => void
}

export function FilterChips({ filters, filter, onFilter }: FilterChipsProps) {
  return (
    <div className="library-filters" role="tablist" aria-label="Show">
      {filters.map((f) => (
        <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => onFilter(f.key)}>
          {f.label}
        </button>
      ))}
    </div>
  )
}
