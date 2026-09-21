/**
 * Drawer tap targets that navigate the main column and must therefore
 * collapse the drawer, so the content they opened gets the whole screen.
 *
 * Every fragment is a hashed-class substring (`[class*=…]`) except the two
 * marker-attribute entries. The list is intentionally narrow: a tap that
 * opens a menu (session-row kebab) or mutates state in place must leave the
 * drawer mounted, so only genuine navigation targets belong here.
 *
 * `panelRow` covers the sidebar's global-panel entries (Plugins, Skills, …).
 * Those swap the conversation for a full-width panel; without this entry the
 * drawer stayed open on top of the panel it had just opened, and the host
 * offers no in-panel way back (`layout.selectPanel(null)` is never reachable
 * from the UI), leaving the user with a drawer over a panel and no exit.
 */
const DRAWER_NAV_TAP_FRAGMENTS = [
  'newSession',
  'sessionRow',
  'searchResultRow',
  'searchResultWorkspace',
  'panelRow',
] as const

/** Full selector for drawer tap targets that collapse the drawer. */
export const DRAWER_NAV_TAP_SELECTOR =
  'button[data-dsh-taskboard-entry], button[data-dsh-ssh-entry], ' +
  DRAWER_NAV_TAP_FRAGMENTS.map((fragment) => `[class*="${fragment}"]`).join(', ')

/**
 * Does a drawer subtree element carrying this class fragment count as a
 * navigation tap? Pure predicate over the fragment list, so the decision
 * table is unit-testable without a DOM.
 * @param fragment - a single class-name fragment to test.
 * @returns true when the fragment is one of the navigation targets.
 */
export function matchesDrawerNavTap(fragment: string): boolean {
  return (DRAWER_NAV_TAP_FRAGMENTS as readonly string[]).includes(fragment)
}

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
