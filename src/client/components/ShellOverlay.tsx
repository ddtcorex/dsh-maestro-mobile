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
 * DSH-native shell overlay: backdrop + exit FAB rendered inside AppFrame's
 * overlayLayer (z20, pointer-events auto per child). Reuses DSH's
 * overlay container instead of manual frame.appendChild.
 * Drawer open state reads the same data-sidebar-collapsed that AppFrame owns.
 *
 * The FAB has one face: while a panel owns the main column it returns to the
 * conversation (the only control on screen there — the session header does
 * not render on a panel page). Every drawer entry belongs to the host's own
 * opener, so there is no hero FAB duplicating it (owner report 2026-11-06).
 * @param props - overlay props.
 */
export function ShellOverlay({ toggleSidebar, exitPanel, t }: ShellOverlayProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onMq = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', onMq)

    const read = (): void => {
      const frame = getFrame()
      setDrawerOpen(frame !== null && !frame.hasAttribute('data-sidebar-collapsed'))
      // A global panel also has no active phase, so "no active phase" alone
      // would mount the FAB on top of the panel's own content. Ask the
      // positive question.
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

  const mode = fabMode({ drawerOpen, panelOpen })

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
          aria-label={t('backToConversation')}
          title={t('backToConversation')}
          onClick={() => exitPanel()}
          style={{ position: 'absolute', pointerEvents: 'auto' }}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="18" height="18">
            <path
              d="M9.8 3.4 5.2 8l4.6 4.6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  )
}
