import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  children?: React.ReactNode
}

/**
 * DSH-native bottom sheet: reuses Modal's mask + dialog tokens
 * (--dsw-alias-bg-mask-1, --dsw-mask-blur, --dsw-alias-bg-layer-2, --dsw-shadow-lv3)
 * but positions as a bottom sheet on mobile via CSS.
 * Desktop falls back to centered dialog (no-op via media query).
 * @param props - sheet props.
 * @returns portal or null.
 */
export function BottomSheet({ open, onClose, title, closeLabel, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div data-mobile-sheet="root" role="presentation">
      <div data-mobile-sheet="mask" aria-hidden="true" onClick={onClose} />
      <div
        data-mobile-sheet="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div data-mobile-sheet="handle" aria-hidden="true" />
        <div data-mobile-sheet="header">
          <h2 data-mobile-sheet="title">{title}</h2>
          <button type="button" data-mobile-sheet="close" aria-label={closeLabel} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div data-mobile-sheet="body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
