import { useEffect, useRef } from 'react'
import { layers, type Command, type OperatorSnapshot } from '@openstage/shared'
import { jumpDeck, jumpTarget, sectionJumps, showNow } from './components/jumps'
import { dispatch } from './engine'

const fixedKeys: Record<string, Command> = {
  ' ': { type: 'live.take' },
  ArrowRight: { type: 'live.next' },
  PageDown: { type: 'live.next' },
  ArrowLeft: { type: 'live.previous' },
  PageUp: { type: 'live.previous' },
}

interface ShortcutActions {
  /** `/` or Ctrl/Cmd+L: open the Library drawer with its search focused. */
  onLibrary?: () => void
}

/** Present's keys. Off (null) everywhere else, so typing or arrowing in an editor never changes the screens. */
export function useShortcuts(snapshot: OperatorSnapshot | null, actions: ShortcutActions = {}): void {
  const latest = useRef({ snapshot, actions })
  latest.current = { snapshot, actions }
  const isReady = snapshot !== null
  useEffect(() => {
    if (!isReady) return
    const onKey = (event: KeyboardEvent) => {
      const { snapshot, actions } = latest.current
      if (!snapshot) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l' && actions.onLibrary) {
        event.preventDefault()
        return actions.onLibrary()
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const handled = handle(event.key, snapshot, actions)
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isReady])
}

function handle(key: string, snapshot: OperatorSnapshot, actions: ShortcutActions): boolean {
  const { state, service } = snapshot
  const layer = layers.find((l) => l.shortcut === key)
  if (layer) return dispatch({ type: 'layer.clear', layer: layer.key }), true
  if (fixedKeys[key]) return dispatch(fixedKeys[key]), true
  if (key === 'Escape') return dispatch({ type: 'screens.black', isBlack: !state.isBlack }), true
  if (key === '/' && actions.onLibrary) return actions.onLibrary(), true
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const index = service.items.findIndex((i) => i.id === state.selectedItemId)
    const next = service.items[index + (key === 'ArrowUp' ? -1 : 1)]
    if (next) dispatch({ type: 'item.select', itemId: next.id })
    return true
  }
  const deck = jumpDeck(snapshot)
  const jump = sectionJumps(deck).find((j) => j.key === key.toUpperCase())
  if (!deck || !jump) return false
  const liveIndex = state.live.slide?.itemId === deck.itemId ? state.live.slide.index : -1
  showNow(snapshot, { itemId: deck.itemId, index: jumpTarget(jump, liveIndex) })
  return true
}
