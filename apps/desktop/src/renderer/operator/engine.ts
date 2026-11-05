import { useSyncExternalStore } from 'react'
import type { Command, OperatorSnapshot } from '@openstage/shared'
import { engine } from '../engine-client'

let latest: OperatorSnapshot | null = null

engine.subscribe((message) => {
  if (message.type === 'snapshot') latest = message.snapshot
})

export function useSnapshot(): OperatorSnapshot | null {
  return useSyncExternalStore(
    (onChange) => engine.subscribe((message) => message.type === 'snapshot' && onChange()),
    () => latest,
  )
}

export function dispatch(command: Command): void {
  engine.send({ type: 'command', command })
}
