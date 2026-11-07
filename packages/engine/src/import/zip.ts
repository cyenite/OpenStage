import { inflateRawSync } from 'node:zlib'
import type { SourceFile } from './types'

const entryLimit = 5000
const fileLimit = 200 * 1024 * 1024
const totalLimit = 600 * 1024 * 1024

/**
 * Reads the files in a ZIP archive (stored or deflated), such as an eBible.org download. Sizes are
 * checked against what each entry declares and against fixed limits, so a crafted archive cannot
 * inflate far beyond its size and exhaust memory.
 */
export function unzip(bytes: Uint8Array): SourceFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('Not a ZIP archive')
  const count = view.getUint16(end + 10, true)
  if (count > entryLimit) throw new Error(`The ZIP holds more than ${entryLimit} files`)
  let offset = view.getUint32(end + 16, true)
  let total = 0
  const files: SourceFile[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged')
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (size > fileLimit || total + size > totalLimit) throw new Error('The ZIP holds more data than OpenStage will unpack')
    const localName = view.getUint16(local + 26, true)
    const localExtra = view.getUint16(local + 28, true)
    const start = local + 30 + localName + localExtra
    const data = bytes.subarray(start, start + compressed)
    let content: Uint8Array
    if (method === 0) content = data
    else if (method === 8) content = new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(size, 1) }))
    else continue
    if (content.length !== size) throw new Error(`“${name}” in the ZIP is not the size the archive says`)
    total += size
    files.push({ name, bytes: content })
  }
  return files
}
