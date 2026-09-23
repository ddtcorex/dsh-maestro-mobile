/**
 * Fade the drawer's dimming layer out in step with a slide-out.
 *
 * The backdrop belongs to the `shell.overlay` slot
 * (components/ShellOverlay.tsx) and is rendered only while the drawer is open:
 * the host flips `data-sidebar-collapsed` when the close animation LANDS, and
 * React unmounts the layer at that moment. Without a fade the dimming therefore
 * snaps away ~280ms after the drawer has already left, which reads as "drawer,
 * then a dark rectangle disappearing" - the reason `sidebar-swipe.ts` fades it
 * when it commits a close.
 *
 * The element is resolved here rather than taken from a registered hook, and
 * that is deliberate: the previous implementation was a hook whose only setter
 * lived in a task nothing installed, so the call site went silent and the fade
 * was lost without a trace (docs/maintenance/pitfalls.md). A function that finds
 * its own element cannot go stale that way. No restore is needed either - the
 * next open mounts a fresh node, so these inline properties cannot outlive the
 * close they describe.
 */

/** The slot component's backdrop marker (not a CSS-module hash). */
export const BACKDROP_SELECTOR = '[data-mobile-nav="backdrop"]'

/** The part of the backdrop element this module writes. */
export interface FadeTarget {
  readonly style: {
    setProperty(property: string, value: string, priority?: string): void
  }
  getBoundingClientRect(): unknown
}

/**
 * The inline transition a close fade uses. The easing matches the drawer's own
 * commit transition (`transform <ms>ms ease-in-out`): any other curve would leave
 * the dimming visibly ahead of, or behind, the drawer sliding out.
 * @param durationMs - the drawer's commit duration.
 * @returns the CSS transition value.
 */
export function backdropFadeTransition(durationMs: number): string {
  return `opacity ${durationMs}ms ease-in-out`
}

/** The mounted backdrop, or null while the drawer is closed. */
function mountedBackdrop(): FadeTarget | null {
  const backdrop = document.querySelector(BACKDROP_SELECTOR)
  return backdrop instanceof HTMLElement ? backdrop : null
}

/**
 * Fade the mounted drawer backdrop out, in step with the drawer leaving.
 *
 * Every write is `!important`: React owns this element's `style` prop
 * (`pointerEvents: 'auto'`), and the element carries an entry animation, so only
 * an important author declaration outranks both.
 * @param durationMs - the drawer's commit duration.
 * @param resolve - the backdrop resolver (injectable for the unit tests).
 * @returns true when a backdrop was faded.
 */
export function fadeDrawerBackdrop(
  durationMs: number,
  resolve: () => FadeTarget | null = mountedBackdrop,
): boolean {
  const backdrop = resolve()
  if (backdrop === null) return false
  backdrop.style.setProperty('transition', backdropFadeTransition(durationMs), 'important')
  // Flush the before-change style before writing the target: both writes in one
  // task can coalesce into a single recalc that jumps straight to opacity 0 with
  // no transition at all (the drawer's own commit flushes its rect for this).
  void backdrop.getBoundingClientRect()
  backdrop.style.setProperty('opacity', '0', 'important')
  // The layer is leaving: it is the drawer's own close target, so it must stop
  // hit-testing rather than stay a tappable invisible button.
  backdrop.style.setProperty('pointer-events', 'none', 'important')
  return true
}
