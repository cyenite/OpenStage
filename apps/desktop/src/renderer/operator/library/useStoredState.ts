import { useState } from 'react'

/** A per-machine convenience (where the Bible tab was, which language the catalogue showed); losing it is harmless. */
export function useStoredState<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
      return isValid(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })
  const store = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Storage can be full or blocked; the value still holds for this session.
    }
  }
  return [value, store]
}
