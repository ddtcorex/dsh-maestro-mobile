/** `mobileNav` namespace dictionaries: drawer controls. */
export const NS = 'mobileNav'

/** Primary dictionary (the key-set source of truth). */
export const zh = {
  'open': 'Open directory',
  'close': 'Close directory',
  'backdrop': 'Click to close directory',
  'sessionLog': 'Session log',
  'files': 'Files',
  'previewFullscreen': 'Fullscreen preview',
  'previewExitFullscreen': 'Exit fullscreen',
} as const

/** English dictionary, key-identical to the primary source. */
export const en: Record<MobileNavKey, string> = {
  'open': 'Open directory',
  'close': 'Close directory',
  'backdrop': 'Click to close directory',
  'sessionLog': 'Session log',
  'files': 'Files',
  'previewFullscreen': 'Fullscreen preview',
  'previewExitFullscreen': 'Exit fullscreen',
}

/** Key domain of the `mobileNav` namespace (primary dictionary is the source of truth). */
export type MobileNavKey = keyof typeof zh
