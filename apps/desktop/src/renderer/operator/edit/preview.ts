import { layoutSlide, type BackgroundRender, type DeckSlide, type RenderState, type Theme } from '@openstage/shared'

/** What the projector would show for this slide in this theme, drawn by the real output renderer. */
export function previewRender(theme: Theme, slide: DeckSlide, background: BackgroundRender | null): RenderState {
  return {
    seq: 0,
    aspect: 16 / 9,
    outputId: 'projector',
    transitionMs: 0,
    background: theme.fill ? null : background,
    slide: layoutSlide(theme, 'projector', slide, 'preview'),
    lowerThird: null,
    stage: null,
  }
}

/** Shown behind themes without their own background, so white text is readable in the preview. */
export const previewBackground: BackgroundRender = { kind: 'gradient', from: '#22324A', to: '#0B1220', angle: 160 }
