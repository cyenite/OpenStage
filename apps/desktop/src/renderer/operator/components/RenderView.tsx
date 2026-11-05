import { useEffect, useRef } from 'react'
import { OutputSurface } from '@openstage/output'
import type { RenderState } from '@openstage/shared'

/** The same renderer the output windows use, so Preview and Live show exactly what the screens show. */
export function RenderView({ render, className }: { render: RenderState; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const surface = useRef<OutputSurface | null>(null)

  useEffect(() => {
    const created = new OutputSurface(host.current!)
    surface.current = created
    return () => {
      created.destroy()
      surface.current = null
    }
  }, [])

  useEffect(() => {
    surface.current?.render(render)
  }, [render])

  return <div ref={host} className={className} />
}
