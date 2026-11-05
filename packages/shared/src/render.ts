export interface Rect01 {
  x: number
  y: number
  w: number
  h: number
}

export type TextAlign = 'left' | 'center' | 'right'

export interface FontSpec {
  family: string
  weight: number
  /** Line height as a fraction of the output's height, so text scales with any resolution. */
  size: number
  italic: boolean
}

export type BackgroundRender =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }

export interface TextBoxRender {
  role: TextBoxRole
  frame: Rect01
  lines: string[]
  font: FontSpec
  align: TextAlign
  color: string
  hasShadow: boolean
}

export type TextBoxRole = 'main' | 'secondary' | 'reference' | 'label' | 'next'

export interface SlideRender {
  key: string
  boxes: TextBoxRender[]
}

export interface LowerThirdRender {
  key: string
  title: string
  subtitle: string
}

/**
 * Everything an output needs to draw one frame. Outputs never see the library:
 * the engine resolves text, styles and media before sending.
 */
export interface RenderState {
  seq: number
  aspect: number
  outputId: string
  transitionMs: number
  slide: SlideRender | null
  lowerThird: LowerThirdRender | null
  background: BackgroundRender | null
}
