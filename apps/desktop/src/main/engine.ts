import { startEngineProcess } from '@openstage/engine/process'

startEngineProcess().catch((error) => {
  console.error('[engine] failed to start', error)
  process.exit(1)
})
