export interface WindowState {
  isFocused: boolean
  isMaximized: boolean
  isFullScreen: boolean
}

export type ThemeSource = 'system' | 'light' | 'dark'

export type WindowAction = 'close' | 'minimize' | 'toggle-maximize'

/** Where an output goes: the first free screen, one particular screen, or a window beside the operator. */
export type ScreenChoice = { kind: 'auto' } | { kind: 'window' } | { kind: 'screen'; id: number; name: string }

export interface ScreenInfo {
  id: number
  width: number
  height: number
  name: string
  /** The screen the operator window is on, which no output may cover. */
  isOperator: boolean
}

export interface OutputPlacement {
  /** Null while the output is in a window. */
  screenId: number | null
  outputId: string
  choice: ScreenChoice
}

export interface ScreensState {
  screens: ScreenInfo[]
  placements: OutputPlacement[]
}

/** What the preload exposes to the operator page as `window.openstageChrome`. */
export interface Chrome {
  platform: string
  /** Where a dropped or picked file lives on disk, so the engine can copy it into the media library. */
  pathForFile(file: File): string
  setTheme(source: ThemeSource): void
  windowAction(action: WindowAction): void
  onWindowState(listener: (state: WindowState) => void): () => void
  getScreens(): Promise<ScreensState>
  chooseScreen(outputId: string, choice: ScreenChoice): void
  onScreens(listener: (state: ScreensState) => void): () => void
}
