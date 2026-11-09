import { pageRender, type MediaItem, type Page, type RenderState } from '@openstage/shared'
import { previewBackground } from '../edit/preview'
import { mediaSource } from '../library/media'

/** What the projector would show for a page on its own, drawn by the real output renderer. */
export function pageView(page: Page, media: MediaItem[], key = page.id): RenderState {
  return {
    seq: 0,
    aspect: 16 / 9,
    outputId: 'projector',
    transitionMs: 0,
    background: page.background.kind === 'none' ? previewBackground : null,
    slide: { key, fill: null, boxes: [], page: pageRender(page, mediaSource(media)) },
    lowerThird: null,
    media: null,
    overlays: [],
    stage: null,
  }
}
