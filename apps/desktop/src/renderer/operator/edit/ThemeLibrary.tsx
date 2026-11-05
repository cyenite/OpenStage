import { newId, type Id, type Service, type Theme } from '@openstage/shared'
import { dispatch } from '../engine'
import { LibraryTabs, type EditLibrary } from './LibraryTabs'
import { ThemeTile } from './ThemeTile'

interface ThemeLibraryProps {
  themes: Theme[]
  service: Service
  selectedId: Id | null
  onLibrary: (library: EditLibrary) => void
  onSelect: (themeId: Id) => void
}

export function ThemeLibrary({ themes, service, selectedId, onLibrary, onSelect }: ThemeLibraryProps) {
  const create = () => {
    const id = newId('theme')
    dispatch({ type: 'theme.create', themeId: id, name: 'New theme' })
    onSelect(id)
  }
  return (
    <nav className="sidebar theme-library" aria-label="Theme library">
      <div className="sidebar-head">
        <LibraryTabs library="themes" onLibrary={onLibrary} />
        <button className="button-small" onClick={create}>
          New theme
        </button>
      </div>
      <div className="theme-list">
        {themes.map((theme) => (
          <ThemeTile
            key={theme.id}
            theme={theme}
            label={service.themeId === theme.id ? `${theme.name} · this service` : theme.name}
            isSelected={theme.id === selectedId}
            onPick={() => onSelect(theme.id)}
          />
        ))}
      </div>
    </nav>
  )
}
