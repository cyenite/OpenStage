import type { DocumentKind } from '@openstage/shared'

type Fields = Record<string, unknown>

const isText = (value: unknown): value is string => typeof value === 'string'
const isList = (value: unknown): value is unknown[] => Array.isArray(value)
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !isList(value)

/** Ids name files on disk, so they stay short and free of path characters. */
export function isSafeId(id: unknown): id is string {
  return isText(id) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)
}

/**
 * A shallow shape check per kind: enough that a hand-edited or truncated file cannot crash deck
 * building. Importers validate deeply on the way in.
 */
export const documentValidators: { [K in DocumentKind]: (value: Fields) => boolean } = {
  songs: (v) => isText(v.title) && isFields(v.meta) && isFields(v.sections) && isList(v.arrangements),
  passages: (v) => isText(v.reference) && isList(v.translations) && isList(v.verses),
  services: (v) => isText(v.name) && isList(v.items),
  backgrounds: (v) => isText(v.name) && isFields(v.render),
  lowerThirds: (v) => isText(v.title) && isText(v.subtitle),
  audioCues: (v) => isText(v.name),
}

export function isValidDocument(kind: DocumentKind, value: unknown): boolean {
  return isFields(value) && documentValidators[kind](value)
}
