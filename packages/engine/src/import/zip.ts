import { inflateRawSync } from 'node:zlib'
import type { SourceFile } from './types'

/**
 * Reads the files in a ZIP archive (stored or deflated), such as an eBible.org download. Folders
 * and files over 200 MB are left out; anything the archive says it cannot hold is refused.
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
  let offset = view.getUint32(end + 16, true)
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
    if (name.endsWith('/') || size > 200 * 1024 * 1024) continue
    const localName = view.getUint16(local + 26, true)
    const localExtra = view.getUint16(local + 28, true)
    const start = local + 30 + localName + localExtra
    const data = bytes.subarray(start, start + compressed)
    if (method === 0) files.push({ name, bytes: data })
    else if (method === 8) files.push({ name, bytes: new Uint8Array(inflateRawSync(data)) })
  }
  return files
}
