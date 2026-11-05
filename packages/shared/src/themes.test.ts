import { describe, expect, it } from 'vitest'
import type { DeckSlide } from './library'
import { classicTheme, fontCss, layoutSlide, lookFor, starterThemes, type Theme } from './themes'

const slide = (secondaryLines: string[] = [], reference = ''): DeckSlide => ({ kind: 'verse', label: 'V', lines: ['Main'], secondaryLines, reference })

describe('layoutSlide', () => {
  it('reproduces the phase 0 projector layout with the classic theme', () => {
    const one = layoutSlide(classicTheme, 'projector', slide(), 'k')
    expect(one.boxes.map((b) => b.role)).toEqual(['main'])
    expect(one.boxes[0]!.frame).toEqual({ x: 0.06, y: 0.1, w: 0.88, h: 0.72 })
    expect(one.fill).toBeNull()
    const two = layoutSlide(classicTheme, 'projector', slide(['Pili'], 'John 3:16'), 'k')
    expect(two.boxes.map((b) => [b.role, b.frame.h])).toEqual([
      ['main', 0.4],
      ['secondary', 0.3],
      ['reference', 0.08],
    ])
    expect(two.boxes[1]!.font).toMatchObject({ italic: true, family: fontCss('newsreader') })
  })

  it('carries the fill and lower-third bands', () => {
    const paper = starterThemes.find((t) => t.id === 'paper')!
    expect(layoutSlide(paper, 'projector', slide(), 'k').fill).toEqual({ kind: 'color', color: '#F4EFE6' })
    const band = starterThemes.find((t) => t.id === 'lower-third')!
    expect(layoutSlide(band, 'projector', slide(), 'k').boxes[0]!.backing).toBe('rgba(14, 14, 16, 0.78)')
  })

  it('applies an override only to its output', () => {
    const theme: Theme = { ...classicTheme, overrides: { stream: { fill: { kind: 'color', color: '#000000' }, boxes: { main: { color: '#FF0000', font: { size: 0.05 } } } } } }
    expect(lookFor(theme, 'projector')).toBe(theme)
    const stream = layoutSlide(theme, 'stream', slide(), 'k')
    expect(stream.fill).toEqual({ kind: 'color', color: '#000000' })
    expect(stream.boxes[0]).toMatchObject({ color: '#FF0000', font: { size: 0.05, weight: 600 } })
  })

  it('treats an unknown font family as a CSS family name', () => {
    expect(fontCss('inter')).toContain('Inter Variable')
    expect(fontCss('Gentium Plus')).toBe('Gentium Plus')
  })
})
