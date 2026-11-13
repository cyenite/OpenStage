import { useEffect, useRef } from 'react'
import { OutputSurface } from '@openstage/output'
import type { RenderState } from '@openstage/shared'

/**
 * The same renderer the output windows use, so the monitors show exactly what the screens show.
 * `isStatic` holds animations and videos still, for thumbnails; it is read once, so change it with a new `key`.
 */
export function RenderView({ render, className, isStatic = false }: { render: RenderState; className?: string; isStatic?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const surface = useRef<OutputSurface | null>(null)

  useEffect(() => {
    // Monitors in the operator window never play sound; outputs do.
    const created = new OutputSurface(host.current!, { isMuted: true, isStatic })
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
