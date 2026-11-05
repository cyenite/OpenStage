import '@openstage/output/output.css'
import { OutputSurface } from '@openstage/output'
import { engine } from '../engine-client'

const surface = new OutputSurface(document.getElementById('root')!)

engine.subscribe((message) => {
  if (message.type !== 'render') return
  surface.render(message.render)
  document.title = `OpenStage output: ${message.render.outputId}`
  requestAnimationFrame(() => engine.send({ type: 'ack', seq: message.render.seq }))
})
