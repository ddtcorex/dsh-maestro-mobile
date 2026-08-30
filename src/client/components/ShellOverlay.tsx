import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '../i18n/locales.ts'
import { getFrame, MOBILE_QUERY } from '../effects/phone-chrome.ts'

export interface ShellOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
  toggleSidebar: () => void
}

/**
 * DSH-native shell overlay: backdrop + FAB rendered inside AppFrame's
 * overlayLayer (z20, pointer-events auto per child). Reuses DSH's
 * overlay container instead of manual frame.appendChild.
 * Drawer open state reads the same data-sidebar-collapsed that AppFrame owns.
 * @param props - overlay props.
 */
export function ShellOverlay({ toggleSidebar, t }: ShellOverlayProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [heroPhase, setHeroPhase] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onMq = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)

    const read = (): void => {
      const frame = getFrame()
      setDrawerOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed'))
      setHeroPhase(document.querySelector('[data-phase="active"]') === null)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-phase'],
    })
    return () => {
      mq.removeEventListener('change', onMq)
      mo.disconnect()
    }
  }, [])

  if (!narrow) return null

  return (
    <>
      {drawerOpen && (
        <div
          data-mobile-nav="backdrop"
          data-shell-overlay-backdrop="true"
          role="button"
          aria-label={t('backdrop')}
          onClick={() => toggleSidebar()}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      {heroPhase && !drawerOpen && (
        <button
          type="button"
          data-mobile-nav="fab"
          data-shell-overlay-fab="true"
          aria-label={t('open')}
          title={t('open')}
          onClick={() => toggleSidebar()}
          style={{ position: 'absolute', pointerEvents: 'auto' }}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="18" height="18">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M9.67 0.52C10.83 0.52 11.76 0.52 12.5 0.60C13.25 0.68 13.88 0.85 14.43 1.25C14.75 1.49 15.04 1.77 15.27 2.10C15.67 2.64 15.84 3.28 15.92 4.03C16 4.76 16 5.69 16 6.85V9.15C16 10.31 16 11.24 15.92 11.97C15.84 12.72 15.67 13.36 15.27 13.90C15.04 14.23 14.75 14.51 14.43 14.75C13.88 15.15 13.25 15.32 12.5 15.40C11.76 15.48 10.83 15.48 9.67 15.48H6.33C5.17 15.48 4.24 15.48 3.50 15.40C2.75 15.32 2.12 15.15 1.57 14.75C1.25 14.51 0.96 14.23 0.73 13.90C0.33 13.36 0.16 12.72 0.08 11.97C-0 11.24 0 10.31 0 9.15V6.85C0 5.69 -0 4.76 0.08 4.03C0.16 3.28 0.33 2.64 0.73 2.10C0.96 1.77 1.25 1.49 1.57 1.25C2.12 0.85 2.75 0.68 3.50 0.60C4.24 0.52 5.17 0.52 6.33 0.52H9.67Z"
              fill="currentColor"
              opacity="0.12"
            />
            <path d="M5 8H11M8 5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </>
  )
}
