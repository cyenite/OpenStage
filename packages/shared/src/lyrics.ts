import { fromChordText, isChord, isChordLine, mergeChordLine, plainLine, toChordText } from './chords'
import { sectionKinds, type SectionKind, type SlideContent, type TextLine } from './library'

export interface ParsedSection {
  kind: SectionKind
  label: string
  slides: SlideContent[]
}

export interface ParsedLyrics {
  sections: ParsedSection[]
  /** Indexes into `sections` in the order they are sung; a repeated chorus appears twice. */
  order: number[]
}

/** Splits text into slides at blank lines. Inline `[G]` chords and chord lines above lyrics both become chords. */
export function parseSlides(text: string): TextLine[][] {
  return blocks(text.split(/\r?\n/)).map(toLines)
}

/**
 * Lines in another language, one block per slide, no chords. Unlike the main text, an empty block
 * is kept (two extra blank lines), so a slide with no translation does not shift the ones after it.
 */
export function parseTranslation(text: string): string[][] {
  if (text.trim() === '') return []
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').map((line) => fromChordText(line).text.trimEnd()).filter((line) => line.trim() !== ''))
}

export function translationText(slides: SlideContent[], language: string): string {
  return slides.map((slide) => (slide.translations?.[language] ?? []).join('\n')).join('\n\n')
}

export function sectionText(slides: SlideContent[]): string {
  return slides.map((slide) => slide.lines.map(toChordText).join('\n')).join('\n\n')
}

/**
 * The paste-lyrics fast path. Headings such as `[Chorus]`, `Verse 2:` or `Kiitikio` start sections and
 * blank lines split slides inside them. Without headings each block becomes a verse, and a block that
 * repeats word for word becomes the chorus.
 */
export function parseLyrics(text: string): ParsedLyrics {
  const lines = text.split(/\r?\n/)
  return lines.some((_, index) => headingAt(lines, index)) ? parseWithHeadings(lines) : parseWithoutHeadings(lines)
}

function parseWithHeadings(lines: string[]): ParsedLyrics {
  const parsed: ParsedLyrics = { sections: [], order: [] }
  let current: { kind: SectionKind; label: string; lines: string[] } | null = null
  const close = () => {
    if (!current) return
    const slides = parseSlides(current.lines.join('\n')).map((block) => ({ lines: block }))
    const same = parsed.sections.findIndex((s) => s.label.toLowerCase() === current!.label.toLowerCase())
    if (same >= 0 && (slides.length === 0 || sameSlides(parsed.sections[same]!.slides, slides))) {
      parsed.order.push(same)
    } else if (slides.length > 0) {
      const label = same >= 0 ? uniqueLabel(parsed.sections, current.label) : current.label
      parsed.order.push(parsed.sections.push({ kind: current.kind, label, slides }) - 1)
    }
  }
  for (const [index, line] of lines.entries()) {
    const found = headingAt(lines, index)
    if (found) {
      close()
      current = { ...found, lines: [] }
    } else {
      current ??= { kind: 'verse', label: 'Verse 1', lines: [] }
      current.lines.push(line)
    }
  }
  close()
  return parsed
}

function parseWithoutHeadings(lines: string[]): ParsedLyrics {
  const parsed: ParsedLyrics = { sections: [], order: [] }
  const found = blocks(lines).map(toLines)
  const keys = found.map((block) => block.map((line) => line.text.toLowerCase()).join('\n'))
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index)
  const seen = new Map<string, number>()
  let verse = 0
  found.forEach((block, index) => {
    const key = keys[index]!
    if (seen.has(key)) return void parsed.order.push(seen.get(key)!)
    const isChorus = key === repeated
    const section: ParsedSection = { kind: isChorus ? 'chorus' : 'verse', label: isChorus ? 'Chorus' : `Verse ${++verse}`, slides: [{ lines: block }] }
    seen.set(key, parsed.sections.push(section) - 1)
    parsed.order.push(seen.get(key)!)
  })
  return parsed
}

/**
 * `[Anything]` on its own line is always a heading. A bare word such as `Chorus` or `Verse 2:` only
 * counts at the start of a block, so a lyric line that happens to read "Refrain" stays a lyric.
 */
function headingAt(lines: string[], index: number): { kind: SectionKind; label: string } | null {
  const trimmed = lines[index]!.trim()
  const bracketed = /^\[([^\]]+)\]$/.exec(trimmed)
  if (bracketed && !isChord(bracketed[1]!.trim())) {
    const label = bracketed[1]!.trim()
    return { kind: kindOf(label) ?? 'other', label }
  }
  if (index > 0 && lines[index - 1]!.trim() !== '') return null
  const bare = /^([\p{L} -]+?)\s*(\d+)?\s*:?$/u.exec(trimmed)
  const kind = bare ? kindOf(bare[1]!) : null
  if (!bare || !kind) return null
  const label = `${bare[1]!.charAt(0).toUpperCase()}${bare[1]!.slice(1).toLowerCase()}${bare[2] ? ` ${bare[2]}` : ''}`
  return { kind, label }
}

function kindOf(label: string): SectionKind | null {
  const word = label.toLowerCase().replace(/\s*\d+$/, '').trim()
  return sectionKinds.find((k) => (k.aliases as readonly string[]).includes(word))?.key ?? null
}

function blocks(lines: string[]): string[][] {
  const found: string[][] = []
  let block: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (block.length > 0) found.push(block)
      block = []
    } else {
      block.push(line.replace(/\s+$/, ''))
    }
  }
  if (block.length > 0) found.push(block)
  return found
}

/** `[G]    [C]` with nothing else on the line is a chord line written with brackets. */
function asChordLine(line: string): string | null {
  if (isChordLine(line)) return line
  const bracketed = /^\s*(\[[^\]\s]+\]\s*)+$/.test(line) && [...line.matchAll(/\[([^\]\s]+)\]/g)].every((m) => isChord(m[1]!))
  return bracketed ? line.replace(/\[([^\]\s]+)\]/g, (_, chord: string) => `${chord}  `) : null
}

function toLines(block: string[]): TextLine[] {
  const lines: TextLine[] = []
  for (let i = 0; i < block.length; i++) {
    const line = block[i]!
    const next = block[i + 1]
    const chordLine = asChordLine(line)
    if (chordLine !== null && next !== undefined && asChordLine(next) === null) {
      lines.push(mergeChordLine(chordLine, next))
      i++
    } else if (chordLine !== null) {
      lines.push(mergeChordLine(chordLine, ''))
    } else {
      lines.push(line.includes('[') ? fromChordText(line) : plainLine(line))
    }
  }
  return lines
}

function sameSlides(a: SlideContent[], b: SlideContent[]): boolean {
  return JSON.stringify(a.map((s) => s.lines)) === JSON.stringify(b.map((s) => s.lines))
}

function uniqueLabel(sections: ParsedSection[], label: string): string {
  for (let n = 2; ; n++) {
    const candidate = `${label} ${n}`
    if (!sections.some((s) => s.label.toLowerCase() === candidate.toLowerCase())) return candidate
  }
}
