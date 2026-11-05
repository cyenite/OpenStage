/** Ids name files on disk, so they stay short and free of path characters (and can never be `__proto__`). */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)
}

/** A readable id from a title plus a random suffix, so two songs with one title never collide. */
export function newId(title: string, random: () => number = Math.random): string {
  const slug = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0')
  return `${slug || 'item'}-${suffix}`
}
