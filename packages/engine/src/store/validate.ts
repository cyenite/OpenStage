import type { DocumentKind } from '@openstage/shared'

type Fields = Record<string, unknown>

const isText = (value: unknown): value is string => typeof value === 'string'
const isList = (value: unknown): value is unknown[] => Array.isArray(value)
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !isList(value)

/**
 * A shallow shape check per kind: enough that a hand-edited or truncated file cannot crash deck
 * building. Importers validate deeply on the way in.
 */
export const documentValidators: { [K in DocumentKind]: (value: Fields) => boolean } = {
  songs: (v) => isText(v.title) && isFields(v.meta) && isFields(v.sections) && isList(v.arrangements),
  passages: (v) => (isFields(v.ref) || isText(v.reference)) && isList(v.translations),
  services: (v) => isText(v.name) && isList(v.items),
  backgrounds: (v) => isText(v.name) && isFields(v.render),
  lowerThirds: (v) => isText(v.title) && isText(v.subtitle),
  audioCues: (v) => isText(v.name),
  themes: (v) => isText(v.name) && isFields(v.boxes),
  templates: (v) => isText(v.name) && isList(v.slots),
  presentations: (v) => isText(v.title) && isList(v.pages),
  overlays: (v) => isText(v.name) && isText(v.kind),
  media: (v) => isText(v.name) && isText(v.file) && (v.type === 'image' || v.type === 'video'),
}

export function isValidDocument(kind: DocumentKind, value: unknown): boolean {
  return isFields(value) && documentValidators[kind](value)
}
