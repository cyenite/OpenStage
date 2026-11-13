import { readFile } from 'node:fs/promises'
import { screen, type BrowserWindow, type Display } from 'electron'
import { atomicWriteJson, outputs, type OutputProfile } from '@openstage/engine'
import type { OutputPlacement, ScreenChoice, ScreenInfo, ScreensState } from '../chrome'

type OpenOutput = (profile: OutputProfile, display: Display | null) => BrowserWindow

interface Placed {
  screenId: number | null
  window: BrowserWindow
}

export const isScreenChoice = (value: unknown): value is ScreenChoice => {
  const choice = value as ScreenChoice | null
  if (choice?.kind === 'auto' || choice?.kind === 'window') return true
  return choice?.kind === 'screen' && Number.isInteger(choice.id) && typeof choice.name === 'string'
}

/**
 * Keeps every output on its screen as screens come and go. Placement is worked out again from
 * scratch on every change, so an unplugged screen sends its output back to a window instead of
 * leaving a borderless, always-on-top window wherever the system drops it.
 */
export class ScreenManager {
  private operatorId = -1
  private timer: NodeJS.Timeout | null = null
  private choices: Record<string, ScreenChoice> = {}
  private readonly placed = new Map<string, Placed>()

  constructor(
    private readonly path: string,
    private readonly isWindowed: boolean,
    private readonly operator: BrowserWindow,
    private readonly open: OpenOutput,
  ) {}

  async start(): Promise<void> {
    this.choices = await readChoices(this.path)
    this.place()
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) screen.on(event as 'display-added', () => this.schedule())
    this.operator.on('move', () => {
      if (this.operatorDisplay().id !== this.operatorId) this.schedule()
    })
    this.operator.webContents.on('did-finish-load', () => this.send())
  }

  state(): ScreensState {
    const displays = screen.getAllDisplays()
    const operatorId = this.operatorDisplay().id
    const screens: ScreenInfo[] = displays.map((d, index) => ({ ...d.size, id: d.id, name: nameOf(d, index), isOperator: d.id === operatorId }))
    const placements: OutputPlacement[] = outputs.map((profile) => ({
      screenId: this.placed.get(profile.id)?.screenId ?? null,
      outputId: profile.id,
      choice: this.choices[profile.id] ?? { kind: 'auto' },
    }))
    return { screens, placements }
  }

  choose(outputId: string, choice: ScreenChoice): void {
    if (!outputs.some((o) => o.id === outputId)) return
    this.choices = { ...this.choices, [outputId]: choice }
    atomicWriteJson(this.path, { choices: this.choices }).catch((error) => console.error('[main] could not save the screen choices', error))
    this.place()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.place()
    }, 250)
  }

  private place(): void {
    const displays = this.isWindowed ? [] : screen.getAllDisplays()
    const chosen = new Map(outputs.map((o) => [o.id, this.find(displays, this.choices[o.id])]))
    this.clearOperator(displays, [...chosen.values()])
    this.operatorId = this.operatorDisplay().id
    const used = new Set([this.operatorId])
    const targets = new Map<string, Display | null>()
    for (const [outputId, display] of chosen) {
      if (!display || used.has(display.id)) continue
      used.add(display.id)
      targets.set(outputId, display)
    }
    for (const profile of outputs) {
      if (targets.has(profile.id) || this.choices[profile.id]?.kind === 'screen' || this.choices[profile.id]?.kind === 'window') continue
      const free = displays.find((d) => !used.has(d.id)) ?? null
      if (free) used.add(free.id)
      targets.set(profile.id, free)
    }
    for (const profile of outputs) this.apply(profile, targets.get(profile.id) ?? null)
    this.send()
  }

  /** A screen an output was given outright wins over the operator window, which moves to a free screen if there is one. */
  private clearOperator(displays: Display[], chosen: (Display | null)[]): void {
    const current = this.operatorDisplay()
    if (!chosen.some((d) => d?.id === current.id)) return
    const free = displays.find((d) => !chosen.some((c) => c?.id === d.id))
    if (!free) return
    const isMaximized = this.operator.isMaximized()
    if (isMaximized) this.operator.unmaximize()
    const { workArea } = free
    const bounds = this.operator.getBounds()
    const width = Math.min(bounds.width, workArea.width)
    const height = Math.min(bounds.height, workArea.height)
    const x = workArea.x + Math.round((workArea.width - width) / 2)
    const y = workArea.y + Math.round((workArea.height - height) / 2)
    this.operator.setBounds({ x, y, width, height })
    if (isMaximized) this.operator.maximize()
  }

  /**
   * Frame and always-on-top cannot be swapped on a live window, and a fullscreen window on Linux
   * ignores new bounds, so moving to another screen or to a window opens a new one.
   */
  private apply(profile: OutputProfile, display: Display | null): void {
    const current = this.placed.get(profile.id)
    const screenId = display?.id ?? null
    if (current && !current.window.isDestroyed() && current.screenId === screenId) {
      if (display && process.platform !== 'linux') current.window.setBounds(display.bounds)
      return
    }
    if (current && !current.window.isDestroyed()) current.window.destroy()
    const window = this.open(profile, display)
    this.placed.set(profile.id, { screenId, window })
    window.once('closed', () => {
      if (this.placed.get(profile.id)?.window === window) this.placed.delete(profile.id)
    })
  }

  /** Ids are stable for the same monitor on the same port; the name catches the same monitor moved to another port. */
  private find(displays: Display[], choice: ScreenChoice | undefined): Display | null {
    if (choice?.kind !== 'screen') return null
    const byName = displays.filter((d) => d.label && d.label === choice.name)
    return displays.find((d) => d.id === choice.id) ?? (byName.length === 1 ? byName[0]! : null)
  }

  private operatorDisplay(): Display {
    return screen.getDisplayMatching(this.operator.getBounds())
  }

  private send(): void {
    if (!this.operator.isDestroyed()) this.operator.webContents.send('screens', this.state())
  }
}

function nameOf(display: Display, index: number): string {
  if (display.label) return display.label
  return display.internal ? 'Built-in display' : `Screen ${index + 1}`
}

async function readChoices(path: string): Promise<Record<string, ScreenChoice>> {
  try {
    const stored = JSON.parse(await readFile(path, 'utf8')) as { choices?: Record<string, unknown> }
    return Object.fromEntries(Object.entries(stored.choices ?? {}).filter((entry): entry is [string, ScreenChoice] => isScreenChoice(entry[1])))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[main] could not read the screen choices, using automatic placement', error)
    return {}
  }
}
