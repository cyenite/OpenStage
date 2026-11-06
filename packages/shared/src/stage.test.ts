import { describe, expect, it } from 'vitest'
import { formatCountdown, shortLabel, timerRemaining } from './stage'

describe('stage helpers', () => {
  it('shortens section labels for the chips', () => {
    expect(['Verse 1', 'Chorus', 'Pre-chorus', 'Kiitikio', 'Ubeti 2', 'Chorus 2'].map(shortLabel)).toEqual(['V1', 'C', 'PC', 'K', 'U2', 'C2'])
  })

  it('counts down from the end time while running and shows time over', () => {
    expect(timerRemaining({ label: '', durationMs: 60_000, endsAt: 100_000, remainingMs: 60_000 }, 70_000)).toBe(30_000)
    expect(timerRemaining({ label: '', durationMs: 60_000, endsAt: null, remainingMs: 12_000 }, 70_000)).toBe(12_000)
    expect(formatCountdown(30 * 60_000)).toBe('30:00')
    expect(formatCountdown(61_500)).toBe('1:02')
    expect(formatCountdown(-75_000)).toBe('+1:15')
    expect(formatCountdown(3_725_000)).toBe('1:02:05')
  })
})
