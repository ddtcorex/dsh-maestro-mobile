/**
 * The composer's own DOM facts, in one place.
 *
 * `[data-composer-input]` is the Lexical editing surface upstream draws, and the
 * literal was spelled out in five modules (both composer effects, the debug
 * badge, the git-chip re-parent and the stats-row hunter) while two of them also
 * carried their own copy of `editorElement()`. Upstream rebuilds the
 * conversation package between releases, so this marker is exactly the kind of
 * fact that must have one home - see docs/upstream/compat-contracts.json for the
 * scan that watches it.
 */

/** The Lexical editing surface: focus goes here, and only here, to type. */
export const EDITOR_SELECTOR = '[data-composer-input]'

/**
 * The sticky composer block: the host-owned wrapper around the composer card
 * and the stats row, so one transform lifts the whole block. A stable
 * host-drawn marker (see docs/upstream/compat-contracts.json `composer-seat`),
 * already read by the debug badge and the composer geometry rules.
 */
export const SEAT_SELECTOR = '[data-composer-seat]'

/** The visual viewport fields the keyboard readings compare. */
export interface ViewportMetrics {
  readonly height: number
  readonly scale: number
}

/** The composer editor, or null when this session has none. */
export function editorElement(): HTMLElement | null {
  const editor = document.querySelector(EDITOR_SELECTOR)
  return editor instanceof HTMLElement ? editor : null
}

/**
 * The composer seat, or null when this session has none.
 * @returns the seat element, or null when absent.
 */
export function seatElement(): HTMLElement | null {
  const seat = document.querySelector(SEAT_SELECTOR)
  return seat instanceof HTMLElement ? seat : null
}

/** The visual viewport metrics, or null where the API is missing. */
export function viewportMetrics(): ViewportMetrics | null {
  const viewport = window.visualViewport
  if (viewport === null || viewport === undefined) return null
  return { height: viewport.height, scale: viewport.scale }
}

/**
 * The tallest visual viewport height seen recently: the page with no keyboard.
 *
 * iOS on a page that cannot scroll shrinks the LAYOUT viewport with the
 * keyboard, and `interactive-widget=resizes-content` makes Chrome for Android
 * do the same — so `innerHeight - visualViewport.height` stays near zero
 * while a keyboard is up and the classic inset reads a keyboard that is
 * right there as absent. The tallest height seen is the baseline that
 * survives that; it heals by itself once a taller reading arrives. One home
 * for both keyboard readers (composer-plus-toggle, composer-focus-release).
 * @param previous - the baseline so far.
 * @param current - the height just read (0 or less when unreadable).
 * @returns the new baseline.
 */
export function restingViewportHeight(previous: number, current: number): number {
  if (current <= 0) return previous
  return Math.max(previous, current)
}
