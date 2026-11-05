import type { CSSProperties } from 'react'
import { fontCss, type Theme } from '@openstage/shared'
import { previewBackground } from './preview'

interface ThemeTileProps {
  theme: Theme
  label?: string
  isSelected: boolean
  onPick: () => void
}

/** A small swatch of a theme: its background (or the sample one) with "Aa" in its main font and colour. */
export function ThemeTile({ theme, label, isSelected, onPick }: ThemeTileProps) {
  const fill = theme.fill ?? previewBackground
  const main = theme.boxes.main
  const style = {
    background: fill.kind === 'color' ? fill.color : `linear-gradient(${fill.angle}deg, ${fill.from}, ${fill.to})`,
    color: main.color,
    fontFamily: fontCss(main.font.family),
    fontWeight: main.font.weight,
    fontStyle: main.font.italic ? 'italic' : 'normal',
    justifyContent: main.frame.y > 0.5 ? 'flex-end' : 'center',
  } as CSSProperties
  return (
    <button className={`theme-tile${isSelected ? ' is-selected' : ''}`} aria-pressed={isSelected} aria-label={`${label ?? theme.name} theme`} onClick={onPick}>
      <span className="theme-swatch" style={style}>
        <span className={main.backing ? 'theme-swatch-band' : undefined} style={main.backing ? { background: main.backing } : undefined}>
          Aa
        </span>
      </span>
      <span className="theme-tile-name">{label ?? theme.name}</span>
    </button>
  )
}
