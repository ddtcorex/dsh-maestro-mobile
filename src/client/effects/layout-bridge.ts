import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { findFrame, MOBILE_QUERY } from './phone-chrome.ts'

/**
 * Layout bridge: reuses DSH's own breakpoint (SIDEBAR_AUTO_COLLAPSE=1024)
 * instead of duplicating it. Observes the layout store indirectly via
 * matchMedia + frame marker, so drawer state stays in sync with AppFrame's
 * narrow detection. Keeps data-mobile-nav="frame" as a compat marker for
 * existing CSS while the style migration completes.
 * @param ctx - client root context.
 */
export function installLayoutBridge(ctx: ClientContext): void {
  ctx.effect(() => {
    const narrow = window.matchMedia(MOBILE_QUERY)
    let frame: HTMLElement | null = null

    const ensureFrame = (): HTMLElement | null => {
      frame = findFrame()
      if (frame !== null && !frame.hasAttribute('data-mobile-nav')) {
        frame.setAttribute('data-mobile-nav', 'frame')
      }
      return frame
    }

    const sync = (): void => {
      const f = ensureFrame()
      if (f === null) return
      // DSH AppFrame already manages data-sidebar-collapsed via its own
      // narrowExpanded store; we just ensure the frame marker exists so
      // mobile CSS selectors remain functional during migration.
      // No extra state is written — AppFrame is the source of truth.
    }

    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { childList: true, subtree: true })

    const onChange = (): void => sync()
    narrow.addEventListener('change', onChange)

    return () => {
      mo.disconnect()
      narrow.removeEventListener('change', onChange)
      // Do not clear data-mobile-nav here — frame-controller owns it.
    }
  }, 'dsh-maestro-mobile: layout bridge (reuse DSH AppFrame)')
}
