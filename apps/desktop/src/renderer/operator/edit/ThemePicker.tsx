import { classicTheme, lookup, newId, type Id, type Theme } from '@openstage/shared'
import { dispatch } from '../engine'
import { ThemeTile } from './ThemeTile'

interface ThemePickerProps {
  themes: Theme[]
  themeId: Id | undefined
  serviceThemeId: Id | undefined
  onPick: (themeId: Id | null) => void
  onOpenTheme: (themeId: Id) => void
}

/** Themes are linked, not copied: the song keeps an id, so editing the theme updates every song using it. */
export function ThemePicker({ themes, themeId, serviceThemeId, onPick, onOpenTheme }: ThemePickerProps) {
  const byId = Object.fromEntries(themes.map((t) => [t.id, t]))
  const serviceTheme = lookup(byId, serviceThemeId) ?? lookup(byId, classicTheme.id) ?? classicTheme
  const current = lookup(byId, themeId) ?? serviceTheme
  const duplicate = () => {
    const id = newId(`${current.name} copy`)
    dispatch({ type: 'theme.create', themeId: id, name: `${current.name} copy`, fromThemeId: current.id })
    onPick(id)
    onOpenTheme(id)
  }
  return (
    <div className="inspector-block">
      <div className="inspector-head">
        <span className="panel-title">Theme</span>
        <button className="button-quiet button-small" onClick={() => onOpenTheme(current.id)}>
          Edit “{current.name}”
        </button>
      </div>
      <div className="theme-grid">
        <ThemeTile theme={serviceTheme} label={`Service: ${serviceTheme.name}`} isSelected={themeId === undefined} onPick={() => onPick(null)} />
        {themes.map((theme) => (
          <ThemeTile key={theme.id} theme={theme} isSelected={themeId === theme.id} onPick={() => onPick(theme.id)} />
        ))}
        <button className="theme-tile theme-tile-new" aria-label={`New theme from ${current.name}`} onClick={duplicate}>
          <span className="theme-swatch">+</span>
          <span className="theme-tile-name">New from this</span>
        </button>
      </div>
      <span className="inspector-note">Themes are linked, not copied: change one and every song using it updates.</span>
    </div>
  )
}
