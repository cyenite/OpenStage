import { useEffect, useState } from 'react'
import type { Chrome, ThemeSource, WindowState } from '../../chrome'

declare global {
  interface Window {
    openstageChrome?: Chrome
  }
}

export const chrome = window.openstageChrome
export const isMac = chrome?.platform === 'darwin'

export const workspaces = [
  { key: 'plan', label: 'Plan' },
  { key: 'edit', label: 'Edit' },
  { key: 'present', label: 'Present' },
] as const

export type Workspace = (typeof workspaces)[number]['key']

export const appearances = [
  { key: 'dark', label: 'Dark', source: 'dark' },
  { key: 'light', label: 'Light', source: 'light' },
  { key: 'auto', label: 'Auto', source: 'system' },
] as const satisfies readonly { key: string; label: string; source: ThemeSource }[]

export type Appearance = (typeof appearances)[number]['key']

/** Window chrome preferences are per machine and per person, so they live in the page's own storage. */
function useStored<T extends string>(key: string, allowed: readonly { key: T }[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return allowed.some((a) => a.key === stored) ? (stored as T) : fallback
    } catch {
      return fallback
    }
  })
  const store = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // A blocked store only means the choice is not remembered next time.
    }
  }
  return [value, store]
}

/** Not remembered: after a restart, crash included, the operator must land on the live controls. */
export function useWorkspace() {
  return useState<Workspace>('present')
}

export function useAppearance() {
  const [appearance, setAppearance] = useStored<Appearance>('openstage.appearance', appearances, 'auto')
  useEffect(() => {
    const root = document.documentElement
    if (appearance === 'auto') delete root.dataset['theme']
    else root.dataset['theme'] = appearance
    chrome?.setTheme(appearances.find((a) => a.key === appearance)!.source)
  }, [appearance])
  return [appearance, setAppearance] as const
}

export function useWindowState(): WindowState {
  const [state, setState] = useState<WindowState>({ isFocused: true, isMaximized: false, isFullScreen: false })
  useEffect(() => chrome?.onWindowState(setState), [])
  return state
}
