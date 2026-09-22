import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installMobileEffect } from './phone-chrome.ts'
import { isClosestLike } from './drag-yield.ts'
import { OVERLAY_MENU_SELECTOR } from './sidebar-swipe.ts'

/**
 * Keep an open overlay option list alive through a touch tap.
 *
 * The host menus (the composer model picker, the session-row kebab, the preset
 * list) dismiss themselves from a `focusout` whose `relatedTarget` is outside
 * the owning root and its portalled menu:
 *
 *     const onBlur = (event) => {
 *       if (relatedTarget is inside root or menu) return
 *       close()
 *     }
 *
 * Chrome focuses the tapped row, so the `focusout` it produces carries that row
 * as `relatedTarget` and the menu survives. iOS Safari does not move focus onto
 * a tapped button: the same tap produces `focusout` with `relatedTarget: null`
 * and no following `focusin`, the host reads it as "dismiss", unmounts the card,
 * and the tap's own `click` never reaches the row — reported as "the model list
 * appears but choosing a model does nothing, the menu just closes".
 *
 * The narrow fix is to stop that one `focusout` from reaching the host while a
 * touch tap is in flight inside the overlay, so the card is still mounted when
 * the tap's `click` lands and the row's own click handler performs the
 * selection. It is armed only by a touch/pen pointer that landed on an overlay
 * surface and expires within {@link TAP_WINDOW_MS}; keyboard navigation, mouse
 * interaction, and every focus change that stays inside the overlay are
 * untouched, so Tab-out still dismisses as before.
 */

/**
 * How long after a touch pointerdown on an overlay surface the focus loss is
 * treated as part of that tap. A touch tap resolves within a few hundred ms;
 * the window is generous enough for a slow tap and far shorter than the gap to
 * the user's next deliberate focus move.
 */
const TAP_WINDOW_MS = 1200

/** Minimal surface face the dismissal test needs (injectable for tests). */
interface SurfaceLike {
  contains(node: unknown): boolean
}

const isSurfaceLike = (value: unknown): value is SurfaceLike =>
  typeof value === 'object' && value !== null && typeof (value as SurfaceLike).contains === 'function'

/** Whether a node is (inside) an overlay option surface. */
function insideOverlay(node: unknown): boolean {
  return isClosestLike(node) && node.closest(OVERLAY_MENU_SELECTOR) !== null
}

/**
 * Whether a `focusout` is the tap's own dismissal read and must be stopped.
 *
 * Pure decision behind the guard's listener, so the rule is unit-testable
 * without a DOM: stop only while a touch tap is in flight, only for a focus
 * loss that starts inside the overlay, and never when focus moves to another
 * control inside the same surface (the host's roving focus).
 *
 * @param target - the focusout event target (may be anything).
 * @param relatedTarget - the focusout related target (may be anything).
 * @param tapActive - whether a touch tap is currently in flight on the overlay.
 * @returns true when the event must not reach the host.
 */
export function shouldSwallowOverlayFocusOut(target: unknown, relatedTarget: unknown, tapActive: boolean): boolean {
  if (!tapActive) return false
  if (!insideOverlay(target)) return false
  const surface = (target as { closest(selector: string): unknown }).closest(OVERLAY_MENU_SELECTOR)
  if (!isSurfaceLike(surface)) return false
  if (typeof relatedTarget === 'object' && relatedTarget !== null && surface.contains(relatedTarget)) return false
  return true
}

/**
 * Install the overlay tap guard for touch-primary viewports.
 * @param ctx - client root context.
 */
export function installOverlayMenuTapGuard(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: overlay menu tap guard', () => {
    if (typeof PointerEvent === 'undefined' && typeof TouchEvent === 'undefined') return undefined

    let tapUntil = 0
    const arm = (target: EventTarget | null): void => {
      if (!insideOverlay(target)) return
      tapUntil = Date.now() + TAP_WINDOW_MS
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      arm(event.target)
    }
    // Belt-and-braces for engines that deliver the touch without a pointer
    // event; the arm is idempotent, so both firing changes nothing.
    const onTouchStart = (event: TouchEvent): void => arm(event.target)

    const onFocusOut = (event: FocusEvent): void => {
      if (shouldSwallowOverlayFocusOut(event.target, event.relatedTarget, Date.now() < tapUntil)) {
        // Stop the host's onBlur from reading this as a dismissal. Capture
        // phase on document runs ahead of the React root's delegated listener.
        event.stopImmediatePropagation()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  })
}
