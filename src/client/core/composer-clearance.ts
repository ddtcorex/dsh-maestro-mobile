/**
 * Composer clearance: how much of the composer seat sits outside the band the
 * user can actually see. Pure geometry plus the marker hysteresis, DOM-free so
 * the numbers are unit-testable without a browser. Ported from
 * mexiaosqwq/dsh-web-mobile v3.2.2 (issue #245): a landscape keyboard shrinks
 * the band to about 110-160px while header plus seat exceed it, so the sticky
 * seat top (the Lexical editing row) lands inside the opaque header box.
 *
 * The browser adapter is effects/composer-clearance.ts. Selectors stay local:
 * the seat resolves through core/composer-dom.ts ([data-composer-seat]) and
 * the header through the slot seat, never a hashed class or a bare header.
 */

/** How far scrollY and visualViewport.offsetTop may drift before the model counts as unverified. Same value as composer-keyboard-lift.ts. */
export const SCROLL_CHANNEL_TOLERANCE_PX = 24

/** Occlusion is real from 1px on: sub-pixel overlap is rect rounding. */
export const TIGHT_ENTER_PX = 1

/** The measured band, in viewport coordinates. */
export interface ComposerBand {
  /** min(innerHeight, visualViewport.height): the band the IME leaves. */
  readonly visibleHeight: number
  /** Conversation header bottom edge. */
  readonly headerBottom: number
  /** Seat height with every row visible (unmitigated on purpose). */
  readonly seatHeight: number
  /** Measured seat bottom edge. */
  readonly seatBottom: number
  /** window.scrollY. */
  readonly scrollY: number
  /** visualViewport.offsetTop. */
  readonly offsetTop: number
}

/**
 * Pixels of the composer seat the user cannot see, 0 when untrusted.
 * Fail-open: a wrong 0 keeps the status quo, a wrong positive would restack
 * the header under the composer on devices without the defect.
 * @param band - the measured band.
 * @returns occluded pixels, or 0 when the model is unverified.
 */
export function composerOccludedPx(band: ComposerBand): number {
  const { visibleHeight, headerBottom, seatHeight, seatBottom, scrollY, offsetTop } = band
  for (const value of [visibleHeight, headerBottom, seatHeight, seatBottom, scrollY, offsetTop]) {
    if (!Number.isFinite(value)) return 0
  }
  if (Math.abs(scrollY - offsetTop) > SCROLL_CHANNEL_TOLERANCE_PX) return 0
  const visible = Math.max(0, visibleHeight)
  const seatTop = Math.max(0, visible - Math.max(0, seatHeight))
  const underHeader = Math.max(0, headerBottom - seatTop)
  const belowBand = Math.max(0, seatBottom - visible)
  return underHeader + belowBand
}

/**
 * Hysteresis for the marker: enter on a real overlap, leave only at zero.
 * @param previous - whether the marker is currently armed.
 * @param occludedPx - the occlusion from composerOccludedPx.
 * @returns the next marker state.
 */
export function nextComposerTight(previous: boolean, occludedPx: number): boolean {
  if (!Number.isFinite(occludedPx)) return false
  return previous ? occludedPx > 0 : occludedPx >= TIGHT_ENTER_PX
}
