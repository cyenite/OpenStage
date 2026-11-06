/** Local calendar dates as `YYYY-MM-DD`, the way services store them. */
export function dayKey(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function addMonths(day: string, months: number): string {
  const date = parseDay(day)
  return dayKey(new Date(date.getFullYear(), date.getMonth() + months, 1))
}

/** Six weeks starting on the Monday on or before the first of the month, like the design's grid. */
export function monthGrid(day: string): Date[] {
  const first = parseDay(day)
  first.setDate(1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i))
}

export const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function longDay(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function monthTitle(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
