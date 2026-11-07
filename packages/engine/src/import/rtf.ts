/** Groups whose text is not document text: font and colour tables, styles, pictures, metadata. */
const skippedGroups = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable', 'generator', 'themedata', 'datastore', 'latentstyles'])

/**
 * Plain text from RTF, enough for lyrics: paragraphs and line breaks become newlines, escaped and
 * Unicode characters are decoded, and formatting is dropped.
 */
export function rtfToText(rtf: string): string {
  if (!rtf.startsWith('{\\rtf')) return rtf
  let out = ''
  let i = 0
  let skipDepth = 0
  let depth = 0
  let unicodeSkip = 1
  let pendingSkip = 0
  const skipStack: number[] = []
  while (i < rtf.length) {
    const ch = rtf[i]!
    if (ch === '{') {
      depth++
      skipStack.push(skipDepth)
      i++
      continue
    }
    if (ch === '}') {
      depth--
      skipDepth = skipStack.pop() ?? 0
      i++
      continue
    }
    if (ch === '\\') {
      const next = rtf[i + 1]
      if (next === '\\' || next === '{' || next === '}') {
        if (!skipDepth) out += next
        i += 2
        continue
      }
      if (next === "'") {
        const code = parseInt(rtf.slice(i + 2, i + 4), 16)
        if (!skipDepth && pendingSkip === 0) out += String.fromCharCode(code)
        else if (pendingSkip > 0) pendingSkip--
        i += 4
        continue
      }
      if (next === '*') {
        skipDepth = depth
        i += 2
        continue
      }
      const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 40))
      if (!match) {
        i += 2
        continue
      }
      const [whole, word, param] = match
      i += whole.length
      if (skippedGroups.has(word!)) skipDepth = depth
      if (skipDepth) continue
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n'
      else if (word === 'tab') out += '\t'
      else if (word === 'uc') unicodeSkip = Number(param ?? 1)
      else if (word === 'u') {
        const code = Number(param)
        out += String.fromCharCode(code < 0 ? code + 65536 : code)
        pendingSkip = unicodeSkip
      } else if (word === 'emdash') out += '-'
      else if (word === 'lquote' || word === 'rquote') out += word === 'lquote' ? '‘' : '’'
      else if (word === 'ldblquote' || word === 'rdblquote') out += '"'
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i++
      continue
    }
    if (!skipDepth) {
      if (pendingSkip > 0) pendingSkip--
      else out += ch
    }
    i++
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
