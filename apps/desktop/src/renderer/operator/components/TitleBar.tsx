import type { ReactNode } from 'react'
import type { OperatorSnapshot, OutputStatus } from '@openstage/shared'
import type { WindowState } from '../../../chrome'
import { appearances, chrome, isMac, workspaces, type Appearance, type Workspace } from '../chrome'

interface TitleBarProps {
  title: string
  subtitle: string
  snapshot: OperatorSnapshot
  workspace: Workspace
  appearance: Appearance
  windowState: WindowState
  onSearch: () => void
  onWorkspace: (workspace: Workspace) => void
  onAppearance: (appearance: Appearance) => void
}

/** The unified toolbar is the window's title bar: everything that is not a control drags the window. */
export function TitleBar({ title, subtitle, snapshot, workspace, appearance, windowState, onSearch, onWorkspace, onAppearance }: TitleBarProps) {
  return (
    <header className="titlebar">
      {isMac ? <span className={`traffic-light-space${windowState.isFullScreen ? ' is-hidden' : ''}`} aria-hidden="true" /> : <WindowControls isMaximized={windowState.isMaximized} />}
      <div className="titlebar-title">
        <span className="titlebar-name">{title}</span>
        <span className="titlebar-subtitle">{subtitle}</span>
      </div>
      <Segmented label="Workspace" className="workspace-switch">
        {workspaces.map((w) => (
          <button key={w.key} role="tab" aria-selected={workspace === w.key} onClick={() => onWorkspace(w.key)}>
            {w.label}
          </button>
        ))}
      </Segmented>
      <button className="command-button" onClick={onSearch}>
        <SearchIcon />
        <span className="command-label">Go to song or lyrics</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <div className="output-pills" aria-label="Outputs">
        {snapshot.outputs.map((output) => (
          <OutputPill key={output.id} output={output} />
        ))}
      </div>
      <Segmented label="Appearance" className="appearance-switch" role="group">
        {appearances.map((a) => (
          <button key={a.key} aria-pressed={appearance === a.key} title={a.key === 'auto' ? 'Follows the system appearance' : undefined} onClick={() => onAppearance(a.key)}>
            {a.key === 'dark' && <MoonIcon />}
            {a.key === 'light' && <SunIcon />}
            {a.label}
          </button>
        ))}
      </Segmented>
    </header>
  )
}

interface SegmentedProps {
  role?: 'tablist' | 'group'
  label: string
  className: string
  children: ReactNode
}

function Segmented({ role = 'tablist', label, className, children }: SegmentedProps) {
  return (
    <div className={`segmented ${className}`} role={role} aria-label={label}>
      {children}
    </div>
  )
}

/** macOS-style traffic lights for Linux and Windows, where the window has no frame of its own. */
function WindowControls({ isMaximized }: { isMaximized: boolean }) {
  return (
    <div className="traffic-lights" role="group" aria-label="Window">
      <button className="traffic-light close" aria-label="Close window" onClick={() => chrome?.windowAction('close')}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg>
      </button>
      <button className="traffic-light minimize" aria-label="Minimize window" onClick={() => chrome?.windowAction('minimize')}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6" /></svg>
      </button>
      <button className="traffic-light zoom" aria-label={isMaximized ? 'Restore window' : 'Maximize window'} onClick={() => chrome?.windowAction('toggle-maximize')}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 3v6M3 6h6" /></svg>
      </button>
    </div>
  )
}

function OutputPill({ output }: { output: OutputStatus }) {
  const isInSync = output.isConnected && output.ackedSeq === output.sentSeq
  const status = !output.isConnected ? 'offline' : isInSync ? 'in sync' : 'updating'
  return (
    <span className={`pill pill-${status.replace(' ', '-')}`} title={`${output.name}: ${status}, frame ${output.ackedSeq}/${output.sentSeq}`}>
      <span className="dot" aria-hidden="true" />
      {output.name}
      <span className="visually-hidden">: {status}</span>
    </span>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}
