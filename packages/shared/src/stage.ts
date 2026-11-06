/** Declaration order is the order the Present inspector offers them in. */
export const stageLayouts = [
  { key: 'lyrics', label: 'Lyrics', detail: 'Current and next, for singers and musicians' },
  { key: 'preacher', label: 'Preacher', detail: 'Notes, clock and countdown, with the slide small' },
  { key: 'clock', label: 'Clock', detail: 'A large clock and countdown' },
] as const

export type StageLayoutKey = (typeof stageLayouts)[number]['key']

export interface StageTimer {
  label: string
  durationMs: number
  /** Set while running; the count is then `endsAt - now`. */
  endsAt: number | null
  /** The count while paused. */
  remainingMs: number
}

export interface StageMessage {
  text: string
  sentAt: number
}

export interface StageState {
  layout: StageLayoutKey
  timer: StageTimer
  message: StageMessage | null
}

export const initialStage: StageState = {
  layout: 'lyrics',
  message: null,
  timer: { label: 'Countdown', durationMs: 5 * 60_000, endsAt: null, remainingMs: 5 * 60_000 },
}

/** Negative once the time is up, so the screen can show how far over it is. */
export function timerRemaining(timer: StageTimer, now: number): number {
  return timer.endsAt === null ? timer.remainingMs : timer.endsAt - now
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.abs(ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  const body = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
  return ms < 0 ? `+${body}` : body
}

/** "Verse 1" → V1, "Pre-chorus" → PC, "Kiitikio" → K: the chips along the bottom of the stage screen. */
export function shortLabel(label: string): string {
  return label
    .split(/[\s-]+/)
    .map((word) => (/^\d+$/.test(word) ? word : word.charAt(0).toUpperCase()))
    .join('')
}

export interface StageSection {
  label: string
  isCurrent: boolean
}

/** Everything a stage screen shows; the screen ticks the clock and countdown itself. */
export interface StageRender {
  layout: StageLayoutKey
  title: string
  notes: string
  detail: string
  current: string[]
  next: string[]
  nextLabel: string
  sections: StageSection[]
  timer: StageTimer
  message: StageMessage | null
}
