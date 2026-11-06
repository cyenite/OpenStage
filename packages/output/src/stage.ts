import { formatCountdown, timerRemaining, type StageRender } from '@openstage/shared'

/**
 * The stage screen. The engine sends what to show; the clock, countdown and message age tick here,
 * so the engine sends nothing while time passes.
 */
export class StageView {
  private readonly root: HTMLElement
  private readonly ticker: ReturnType<typeof setInterval>
  private state: StageRender | null = null

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'os-stage-screen'
    parent.append(this.root)
    this.ticker = setInterval(() => this.tick(), 500)
  }

  render(state: StageRender | null): void {
    this.state = state
    this.root.hidden = state === null
    if (!state) return
    this.root.dataset.layout = state.layout
    this.root.replaceChildren(
      row('os-stage-top', [
        text('os-stage-clock', ''),
        text('os-stage-title', state.title),
        stack('os-stage-timer', [text('os-stage-timer-label', state.timer.label), text('os-stage-timer-value', '')]),
      ]),
      state.message ? row('os-stage-message', [text('os-stage-message-text', state.message.text), text('os-stage-message-age', '')]) : text('os-stage-message-space', ''),
      stack('os-stage-body', [
        lines('os-stage-current', state.current),
        stack('os-stage-next', [text('os-stage-next-label', state.nextLabel ? `NEXT · ${state.nextLabel.toUpperCase()}` : ''), lines('os-stage-next-lines', state.next)]),
        lines('os-stage-notes', state.notes ? state.notes.split('\n') : []),
      ]),
      row('os-stage-bottom', [
        ...state.sections.map((s) => text(`os-stage-section${s.isCurrent ? ' is-current' : ''}`, s.label)),
        text('os-stage-detail', state.detail),
      ]),
    )
    this.tick()
  }

  destroy(): void {
    clearInterval(this.ticker)
    this.root.remove()
  }

  private tick(): void {
    const state = this.state
    if (!state) return
    const now = Date.now()
    const remaining = timerRemaining(state.timer, now)
    set(this.root, '.os-stage-clock', new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))
    set(this.root, '.os-stage-timer-value', formatCountdown(remaining))
    this.root.querySelector('.os-stage-timer')?.classList.toggle('is-over', remaining < 0)
    this.root.querySelector('.os-stage-timer')?.classList.toggle('is-running', state.timer.endsAt !== null)
    if (state.message) set(this.root, '.os-stage-message-age', `from the booth · ${age(now - state.message.sentAt)}`)
  }
}

function age(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`
}

function set(root: HTMLElement, selector: string, value: string): void {
  const element = root.querySelector(selector)
  if (element && element.textContent !== value) element.textContent = value
}

function text(className: string, value: string): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  element.textContent = value
  return element
}

function lines(className: string, values: string[]): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  for (const value of values) element.append(text('os-stage-line', value))
  return element
}

function row(className: string, children: HTMLElement[]): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  element.append(...children)
  return element
}

const stack = row
