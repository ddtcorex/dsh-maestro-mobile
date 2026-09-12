/** `mobileNav` namespace dictionaries: drawer controls. */
export const NS = 'mobileNav'

/** Primary dictionary (the key-set source of truth). */
export const zh = {
  'open': 'Open directory',
  'close': 'Close directory',
  'backdrop': 'Click to close directory',
  'sessionLog': 'Session log',
  'previewFullscreen': 'Fullscreen preview',
  'previewExitFullscreen': 'Exit fullscreen',
  'deleteSession': 'Delete session',
  'deleteConfirmTitle': 'Delete session',
  'deleteConfirmDesc': 'Delete "{title}"? Its session log is removed from this machine and cannot be recovered.',
  'deleteConfirmYes': 'Delete',
  'deleteConfirmNo': 'Cancel',
  'deletePending': 'Deleting…',
  'deleteErrorNotFound': 'That session no longer exists. Refresh the list and try again.',
  'deleteErrorBusy': 'That session is still running. Stop it first, then delete it.',
  'deleteErrorResolve': 'Could not tell which session this row belongs to, so nothing was deleted.',
  'deleteErrorGeneric': 'Delete failed: {message}',
} as const

/** English dictionary, key-identical to the primary source. */
export const en: Record<MobileNavKey, string> = {
  'open': 'Open directory',
  'close': 'Close directory',
  'backdrop': 'Click to close directory',
  'sessionLog': 'Session log',
  'previewFullscreen': 'Fullscreen preview',
  'previewExitFullscreen': 'Exit fullscreen',
  'deleteSession': 'Delete session',
  'deleteConfirmTitle': 'Delete session',
  'deleteConfirmDesc': 'Delete "{title}"? Its session log is removed from this machine and cannot be recovered.',
  'deleteConfirmYes': 'Delete',
  'deleteConfirmNo': 'Cancel',
  'deletePending': 'Deleting…',
  'deleteErrorNotFound': 'That session no longer exists. Refresh the list and try again.',
  'deleteErrorBusy': 'That session is still running. Stop it first, then delete it.',
  'deleteErrorResolve': 'Could not tell which session this row belongs to, so nothing was deleted.',
  'deleteErrorGeneric': 'Delete failed: {message}',
}

/** Key domain of the `mobileNav` namespace (primary dictionary is the source of truth). */
export type MobileNavKey = keyof typeof zh
