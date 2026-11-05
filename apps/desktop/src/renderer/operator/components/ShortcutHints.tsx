import { layers } from '@openstage/shared'

export function ShortcutHints() {
  return (
    <footer className="shortcut-hints" aria-label="Keyboard shortcuts">
      <span><kbd>Space</kbd> send to live</span>
      <span><kbd>→</kbd> next</span>
      <span><kbd>←</kbd> previous</span>
      {layers.map((layer) => (
        <span key={layer.key}>
          <kbd>{layer.shortcut}</kbd> clear {layer.label.toLowerCase()}
        </span>
      ))}
      <span><kbd>Esc</kbd> clear all</span>
    </footer>
  )
}
