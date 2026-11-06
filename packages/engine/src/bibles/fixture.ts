import type { BibleText } from '@openstage/shared'

const john3 = (v16: string, v17: string) => ({ JHN: [[], [], Array.from({ length: 17 }, (_, i) => (i === 15 ? v16 : i === 16 ? v17 : ''))] })

/** Two public-domain verses in two Bibles, enough for engine tests without loading the bundled files. */
export const testBibles: BibleText[] = [
  {
    code: 'KJV',
    name: 'King James Version',
    language: 'en',
    notice: 'Public domain',
    books: john3(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
      'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
    ),
  },
  {
    code: 'WEB',
    name: 'World English Bible',
    language: 'en',
    notice: 'Public domain',
    books: john3(
      'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.',
      'For God didn’t send his Son into the world to judge the world, but that the world should be saved through him.',
    ),
  },
]
