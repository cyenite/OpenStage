import { useEffect } from 'react'
import { layers, type Command, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from './engine'

const fixedKeys: Record<string, Command> = {
  ' ': { type: 'live.take' },
  ArrowRight: { type: 'live.next' },
  PageDown: { type: 'live.next' },
  ArrowLeft: { type: 'live.previous' },
  PageUp: { type: 'live.previous' },
  Escape: { type: 'layer.clearAll' },
}

export function useShortcuts(snapshot: OperatorSnapshot | null): void {
  const isReady = snapshot !== null
  useEffect(() => {
    if (!isReady) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const layer = layers.find((l) => l.shortcut === event.key)
      const command: Command | undefined = layer ? { type: 'layer.clear', layer: layer.key } : fixedKeys[event.key]
      if (!command) return
      event.preventDefault()
      dispatch(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isReady])
}
