/** Languages offered first when adding one; any valid code can still be typed. */
export const commonLanguages = [
  { code: 'en', name: 'English' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ki', name: 'Gĩkũyũ' },
  { code: 'luo', name: 'Dholuo' },
  { code: 'luy', name: 'Luluhya' },
  { code: 'kam', name: 'Kikamba' },
  { code: 'kln', name: 'Kalenjin' },
  { code: 'lg', name: 'Luganda' },
  { code: 'rw', name: 'Kinyarwanda' },
  { code: 'am', name: 'Amharic' },
  { code: 'fr', name: 'French' },
] as const

export function languageName(code: string): string {
  return commonLanguages.find((l) => l.code === code)?.name ?? code
}
