import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { composerOccludedPx, nextComposerTight } from '../core/composer-clearance.ts'
import { seatElement } from '../core/composer-dom.ts'
import { getFrame, installMobileEffect } from './phone-chrome.ts'

/**
 * Composer clearance for a keyboard-shrunken landscape band (upstream issue
 * #245, ported from mexiaosqwq/dsh-web-mobile v3.2.2): the sticky seat keeps
 * its height while the visible band drops to about 110-160px, so the editing
 * row lands inside the opaque session header box. Measure the band, header
 * and seat on every viewport episode and publish the decision as a frame
 * marker; the layout CSS lifts the seat above the header while armed.
 *
 * Complements composer-keyboard-lift.ts (iOS-only transform lift): this
 * effect never writes a transform because the seat is already bottom-pinned
 * and the covered part is its top. Fail-open everywhere: garbage readings
 * and disagreeing scroll channels keep the status quo.
 * @param ctx - client root context.
 */
export function installComposerClearance(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: composer clearance', () => {
    let tight = false
    let fullHeight = 0
    let frame = 0

    const clear = (): void => {
      tight = false
      fullHeight = 0
      getFrame()?.removeAttribute('data-mobile-nav-composer-tight')
    }

    const measure = (): void => {
      frame = 0
      const host = getFrame()
      if (host === null) {
        clear()
        return
      }
      const seat = seatElement()
      const header = host.querySelector<HTMLElement>('[data-slot="conversation.session.header"] > header')
      const rect = seat?.getBoundingClientRect() ?? null
      if (seat === null || header === null || rect === null || rect.width === 0 || rect.height === 0) {
        clear()
        return
      }
      if (!tight) fullHeight = rect.height
      const viewport = window.visualViewport
      const occluded = composerOccludedPx({
        visibleHeight: Math.min(window.innerHeight, viewport?.height ?? window.innerHeight),
        headerBottom: header.getBoundingClientRect().bottom,
        seatHeight: fullHeight > 0 ? fullHeight : rect.height,
        seatBottom: rect.bottom,
        scrollY: window.scrollY,
        offsetTop: viewport?.offsetTop ?? 0,
      })
      tight = nextComposerTight(tight, occluded)
      if (tight) {
        if (!host.hasAttribute('data-mobile-nav-composer-tight')) host.setAttribute('data-mobile-nav-composer-tight', '')
      } else if (host.hasAttribute('data-mobile-nav-composer-tight')) {
        host.removeAttribute('data-mobile-nav-composer-tight')
      }
    }

    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }

    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    document.addEventListener('focusin', schedule, true)
    document.addEventListener('focusout', schedule, true)
    schedule()

    return () => {
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      document.removeEventListener('focusin', schedule, true)
      document.removeEventListener('focusout', schedule, true)
      if (frame !== 0) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      clear()
    }
  })
}
