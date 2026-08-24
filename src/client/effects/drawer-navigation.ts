/** Timing for closing the mobile drawer after a navigation gesture. */
export type DrawerCloseTiming = 'ignore' | 'immediate' | 'after-click'

/**
 * Preserve a session row through iOS's synthesized click so React can select
 * it before the drawer is closed.
 * @param eventType - Native gesture event observed by the drawer listener.
 * @param isSessionRow - Whether the event target belongs to a session row.
 * @returns When the drawer may close for this event.
 */
export function drawerCloseTiming(
  eventType: 'click' | 'pointerup',
  isSessionRow: boolean,
): DrawerCloseTiming {
  if (!isSessionRow) return 'immediate'
  return eventType === 'pointerup' ? 'ignore' : 'after-click'
}
