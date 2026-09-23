import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '../i18n/locales.ts'
import { getFrame, MOBILE_QUERY } from '../effects/phone-chrome.ts'
import { isPanelOpen, fabMode, PANEL_MUTATION_ATTRIBUTE_FILTER } from '../effects/panel-presence.ts'

export interface ShellOverlayProps extends PropsRuntime<'shell.overlay'>, PropsLocale<typeof NS> {
  toggleSidebar: () => void
  /** Leave a sidebar panel and come back to the conversation (see panel-exit.ts). */
  exitPanel: () => void
}

/**
 * DSH-native shell overlay: backdrop + FAB rendered inside AppFrame's
 * overlayLayer (z20, pointer-events auto per child). Reuses DSH's
 * overlay container instead of manual frame.appendChild.
 * Drawer open state reads the same data-sidebar-collapsed that AppFrame owns.
 *
 * The FAB has two faces: on the hero screen it opens the drawer, and while a
 * panel owns the main column it returns to the conversation (the only control
 * on screen there — the session header does not render on a panel page).
 * @param props - overlay props.
 */
export function ShellOverlay({ toggleSidebar, exitPanel, t }: ShellOverlayProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [heroPhase, setHeroPhase] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onMq = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)

    const read = (): void => {
      const frame = getFrame()
      setDrawerOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed'))
      setHeroPhase(document.querySelector('[data-phase="active"]') === null)
      // A global panel also has no active phase, so heroPhase alone would mount
      // the FAB on top of the panel's own content. Ask the positive question.
      setPanelOpen(isPanelOpen())
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      // data-sidebar-collapsed is absent entirely while a panel occupies the
      // frame, and aria-current flips as the selected panel row changes.
      attributeFilter: [...PANEL_MUTATION_ATTRIBUTE_FILTER],
    })
    return () => {
      mq.removeEventListener('change', onMq)
      mo.disconnect()
    }
  }, [])

  if (!narrow) return null

  const mode = fabMode({ heroPhase, drawerOpen, panelOpen })

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
      {mode !== 'hidden' && (
        <button
          type="button"
          data-mobile-nav="fab"
          data-shell-overlay-fab="true"
          data-mobile-nav-fab-mode={mode}
          aria-label={t(mode === 'exit-panel' ? 'backToConversation' : 'open')}
          title={t(mode === 'exit-panel' ? 'backToConversation' : 'open')}
          onClick={() => {
            if (mode === 'exit-panel') exitPanel()
            else toggleSidebar()
          }}
          style={{ position: 'absolute', pointerEvents: 'auto' }}
        >
          {mode === 'exit-panel' ? (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="18" height="18">
              <path
                d="M9.8 3.4 5.2 8l4.6 4.6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
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
          )}
        </button>
      )}
    </>
  )
}
