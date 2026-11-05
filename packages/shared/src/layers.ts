export const layers = [
  { key: 'background', label: 'Background', shortcut: 'F1', color: '#5C9CFF' },
  { key: 'slide', label: 'Slides', shortcut: 'F2', color: '#FF5A5F' },
  { key: 'lowerThird', label: 'Lower third', shortcut: 'F3', color: '#C481FF' },
  { key: 'audio', label: 'Audio', shortcut: 'F4', color: '#34C77B' },
] as const

export type Layer = (typeof layers)[number]
export type LayerKey = Layer['key']
