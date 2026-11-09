export interface WindowState {
  isFocused: boolean
  isMaximized: boolean
  isFullScreen: boolean
}

export type ThemeSource = 'system' | 'light' | 'dark'

export type WindowAction = 'close' | 'minimize' | 'toggle-maximize'

/** What the preload exposes to the operator page as `window.openstageChrome`. */
export interface Chrome {
  platform: string
  /** Where a dropped or picked file lives on disk, so the engine can copy it into the media library. */
  pathForFile(file: File): string
  setTheme(source: ThemeSource): void
  windowAction(action: WindowAction): void
  onWindowState(listener: (state: WindowState) => void): () => void
}
