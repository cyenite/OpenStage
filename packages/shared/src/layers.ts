/** Declaration order is the order the operator sees them, bottom of the stack first. */
export const layers = [
  { key: 'background', label: 'Background', shortcut: 'F1', color: '#5C9CFF' },
  { key: 'media', label: 'Media', shortcut: 'F5', color: '#4FC1C9' },
  { key: 'slide', label: 'Slides', shortcut: 'F2', color: '#FF5A5F' },
  { key: 'lowerThird', label: 'Lower third', shortcut: 'F3', color: '#C481FF' },
  { key: 'overlays', label: 'Overlays', shortcut: 'F6', color: '#F2A93B' },
  { key: 'audio', label: 'Audio', shortcut: 'F4', color: '#34C77B' },
] as const

export type Layer = (typeof layers)[number]
export type LayerKey = Layer['key']
