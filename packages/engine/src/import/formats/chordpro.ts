import type { ImportedSong } from '../types'
import { songFromText } from './text-songs'

const environments: Record<string, string> = { chorus: 'Chorus', verse: 'Verse', bridge: 'Bridge', tab: '', grid: '' }

/**
 * ChordPro: `{title}`, `{artist}` and similar directives, `{start_of_chorus}` style environments,
 * `{comment: Verse 2}` as a heading, inline `[G]` chords. It is rewritten into pasted-lyrics form.
 */
export function chordPro(fileTitle: string, source: string): ImportedSong {
  const details: Partial<ImportedSong> = { authors: [] }
  const out: string[] = []
  const used = new Set<string>()
  const heading = (label: string) => {
    used.add(label.toLowerCase())
    out.push('', `[${label}]`)
  }
  let skipping = false
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('#')) continue
    const directive = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line.trim())
    if (!directive) {
      if (!skipping) out.push(line)
      continue
    }
    const name = directive[1]!.toLowerCase()
    const value = directive[2]?.trim() ?? ''
    const start = /^(?:start_of_|so)(chorus|verse|bridge|tab|grid|c|v|b|t|g)$/.exec(name)
    const finish = /^(?:end_of_|eo)(chorus|verse|bridge|tab|grid|c|v|b|t|g)$/.test(name)
    if (name === 'title' || name === 't') details.title = value
    else if (name === 'artist' || name === 'composer' || name === 'lyricist' || name === 'subtitle' || name === 'st') details.authors!.push(...value.split(/\s*[,;&]\s*/).filter(Boolean))
    else if (name === 'copyright') details.copyright = value
    else if (name === 'ccli') details.ccli = value
    else if (name === 'key') details.key = value
    else if (name === 'tempo' && Number(value) > 0) details.tempo = Number(value)
    else if (name === 'comment' || name === 'c' || name === 'comment_italic' || name === 'ci') heading(value)
    else if (start) {
      const kind = { c: 'chorus', v: 'verse', b: 'bridge', t: 'tab', g: 'grid' }[start[1]!] ?? start[1]!
      const base = environments[kind] ?? ''
      skipping = base === ''
      if (!skipping && value) heading(value)
      else if (!skipping && base === 'Chorus') heading(base)
      else if (!skipping) {
        let n = 1
        while (used.has(`${base} ${n}`.toLowerCase())) n++
        heading(`${base} ${n}`)
      }
    } else if (finish) {
      skipping = false
      out.push('')
    }
  }
  const authors = [...new Set(details.authors)]
  return songFromText(details.title || fileTitle, out.join('\n'), { ...details, authors })
}

export function isChordPro(name: string, source: string): boolean {
  return /\.(cho|chordpro|chopro|crd|pro)$/i.test(name) || /^\s*\{\s*(title|t)\s*:/im.test(source)
}
