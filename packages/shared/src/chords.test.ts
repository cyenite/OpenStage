import { describe, expect, it } from 'vitest'
import { fromChordText, isChord, isChordLine, mergeChordLine, toChordText, transposeChord, transposeKey } from './chords'

describe('chords', () => {
  it('recognises chords and rejects words', () => {
    for (const chord of ['G', 'Am', 'F#m7', 'Bbmaj7', 'Dsus4', 'C/E', 'Gadd9', 'E7(b9)']) expect(isChord(chord)).toBe(true)
    for (const word of ['Chorus', 'Grace', 'Be', 'Am I', 'H', 'the']) expect(isChord(word)).toBe(false)
  })

  it('round-trips the inline style', () => {
    const line = fromChordText('Amazing [G]grace, how [C/E]sweet the [G]sound[D7]')
    expect(line).toEqual({
      text: 'Amazing grace, how sweet the sound',
      chords: [
        { chord: 'G', offset: 8 },
        { chord: 'C/E', offset: 19 },
        { chord: 'G', offset: 29 },
        { chord: 'D7', offset: 34 },
      ],
    })
    expect(toChordText(line)).toBe('Amazing [G]grace, how [C/E]sweet the [G]sound[D7]')
  })

  it('keeps brackets that are not chords', () => {
    expect(fromChordText('Sing [softly] now')).toEqual({ text: 'Sing [softly] now', chords: [] })
  })

  it('lays a chord line over the lyric below it by column', () => {
    expect(isChordLine('G    C   D/F#')).toBe(true)
    expect(isChordLine('Go tell it')).toBe(false)
    expect(mergeChordLine('G      C', 'Amazing grace')).toEqual({ text: 'Amazing grace', chords: [{ chord: 'G', offset: 0 }, { chord: 'C', offset: 7 }] })
  })

  it('transposes chords and spells keys the usual way', () => {
    expect(transposeChord('F#m7/C#', 2, false)).toBe('G#m7/D#')
    expect(transposeChord('C', -2, true)).toBe('Bb')
    expect(transposeChord('Bb', 1, false)).toBe('B')
    expect(transposeKey('G', 3)).toBe('Bb')
    expect(transposeKey('Em', 2)).toBe('F#m')
    expect(transposeKey('C', 6)).toBe('F#')
    expect(transposeKey('not a key', 2)).toBe('not a key')
  })
})
