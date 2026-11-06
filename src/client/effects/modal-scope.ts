/**
 * Which `[aria-modal="true"]` elements actually block the mobile shell.
 *
 * DSH 0.2.2 makes the shell's OWN sidebar a modal dialog: the sidebar root
 * carries `role="dialog" aria-modal="true" data-shortcut-modal="sidebar"`
 * whenever the frame is in drawer mode and the drawer is open
 * (dsh-client-ui-sidebar, SidebarRoot: `aria-modal: drawer && !collapsed`).
 * Every question that used a bare `[aria-modal="true"]` therefore answered
 * "a modal is up" the instant the drawer opened:
 *
 * - the swipe layer armed the open follow at the axis lock, the arm flipped the
 *   drawer open, and the very NEXT pointermove saw a modal and called
 *   abortStroke — which animates an armed drawer straight back into its slot.
 *   Measured on 0.2.2-rc.1 at 390x844: pointermove at dx=48 → modalOpen() hit
 *   `DIV.hHd-Xa_root[data-shortcut-modal="sidebar"]` → abortStroke → the drawer
 *   closed ~320ms after it opened (the "the sidebar opens and immediately
 *   closes" report);
 * - Escape and the tap-inside-drawer close both refused to run while the
 *   drawer was open;
 * - the settings toolbar reparenting looked up the drawer where it wanted the
 *   settings sheet.
 *
 * A blocking modal is therefore an `[aria-modal="true"]` that is NOT the
 * shell's own drawer dialog. The host marker is a data attribute (stable and
 * declared) rather than a CSS-module class, and a real dialog portaled INTO
 * the drawer still carries aria-modal without the marker, so it is still
 * detected. Pinned by tests/swipe-stroke-lifecycle.test.ts.
 */
export const SHELL_DRAWER_DIALOG_ATTRIBUTE = 'data-shortcut-modal'

/** The shell's own drawer dialog root (drawer mode + open). */
export const SHELL_DRAWER_DIALOG_SELECTOR = `[${SHELL_DRAWER_DIALOG_ATTRIBUTE}="sidebar"]`

/** An aria-modal dialog that is not the shell's own drawer. */
export const BLOCKING_MODAL_SELECTOR = `[aria-modal="true"]:not(${SHELL_DRAWER_DIALOG_SELECTOR})`

/** Minimal structural slice of Document this module needs (node:test friendly). */
export interface ModalQueryRoot {
  querySelector(selectors: string): Element | null
}

/**
 * The blocking modal currently on screen, or null.
 * @param root - document (default) or a test double.
 * @returns the first `[aria-modal="true"]` that is not the drawer dialog.
 */
export function findBlockingModal(root?: ModalQueryRoot | null): Element | null {
  const scope = root === undefined ? (typeof document === 'undefined' ? null : document) : root
  if (scope === null) return null
  return scope.querySelector(BLOCKING_MODAL_SELECTOR)
}
