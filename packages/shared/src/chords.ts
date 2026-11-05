import type { Chord, TextLine } from './library'

const sharpNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const majorKeys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const minorKeys = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
const flatKeys = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'])

const chordPattern = /^([A-G])([#b]?)((?:maj|min|dim|aug|sus|add|m|M|[0-9]|[+#b°ø()-])*)(?:\/([A-G])([#b]?))?$/

export function isChord(token: string): boolean {
  return chordPattern.test(token)
}

function pitch(letter: string, accidental: string): number {
  const base = sharpNotes.indexOf(letter)
  return (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12
}

function noteName(value: number, isFlat: boolean): string {
  return (isFlat ? flatNotes : sharpNotes)[((value % 12) + 12) % 12]!
}

export function keyPrefersFlats(key: string | undefined): boolean {
  return !!key && flatKeys.has(key)
}

/** Returns the key a song lands in, spelled the way musicians write it (Bb, not A#; F#m, not Gbm). */
export function transposeKey(key: string, semitones: number): string {
  const match = /^([A-G])([#b]?)(m?)$/.exec(key.trim())
  if (!match) return key
  const value = (((pitch(match[1]!, match[2]!) + semitones) % 12) + 12) % 12
  return (match[3] ? minorKeys : majorKeys)[value]!
}

export function transposeChord(chord: string, semitones: number, isFlat: boolean): string {
  const match = chordPattern.exec(chord)
  if (!match) return chord
  const [, root, rootAccidental, quality, bass, bassAccidental] = match
  const shifted = noteName(pitch(root!, rootAccidental!) + semitones, isFlat)
  const shiftedBass = bass ? `/${noteName(pitch(bass, bassAccidental ?? '') + semitones, isFlat)}` : ''
  return `${shifted}${quality}${shiftedBass}`
}

export function plainLine(text: string): TextLine {
  return { text, chords: [] }
}

/** Writes a line in the inline style the editor uses: `Amazing [G]grace, how [C]sweet`. */
export function toChordText(line: TextLine): string {
  let text = line.text
  const chords = [...line.chords].sort((a, b) => b.offset - a.offset)
  for (const { chord, offset } of chords) {
    const at = Math.min(Math.max(offset, 0), text.length)
    text = `${text.slice(0, at)}[${chord}]${text.slice(at)}`
  }
  return text
}

/** Reads the inline style back. Brackets that do not hold a chord stay in the text. */
export function fromChordText(source: string): TextLine {
  const chords: Chord[] = []
  let text = ''
  let rest = source
  for (let match = /\[([^\]\s]+)\]/.exec(rest); match; match = /\[([^\]\s]+)\]/.exec(rest)) {
    const before = rest.slice(0, match.index)
    if (isChord(match[1]!)) {
      text += before
      chords.push({ chord: match[1]!, offset: text.length })
    } else {
      text += before + match[0]
    }
    rest = rest.slice(match.index + match[0].length)
  }
  return { text: text + rest, chords }
}

/** A line made only of chords, as in "chords over lyrics" sheets. */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/)
  return tokens[0] !== '' && tokens.every(isChord)
}

/** Lays a chord line over the lyric line beneath it, keeping each chord's column. */
export function mergeChordLine(chordLine: string, lyric: string): TextLine {
  const chords: Chord[] = []
  for (const match of chordLine.matchAll(/\S+/g)) chords.push({ chord: match[0], offset: Math.min(match.index, lyric.length) })
  return { text: lyric, chords }
}
