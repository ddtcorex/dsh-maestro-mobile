/**
 * Drawer DOM resolution shared by the swipe layer and the drawer-close
 * interactions.
 *
 * The drawer is the shell's sidebar column, NOT the frame's first child: DSH
 * 0.2.2 AppFrame renders its own dimming layer (`div[data-sidebar-mask]`,
 * `.drawerMask`) as the frame's FIRST element child in drawer mode, ahead of
 * the sidebar column. Everything that resolved the drawer with
 * `frame.firstElementChild` therefore bound itself to a transparent, empty
 * div: measured on 0.2.2-rc.1 at 390x844, the open follow pinned and
 * translated `pI_x6G_drawerMask` while the real 280px drawer jumped to its
 * resting position at the 8px arm and never followed the finger, the close
 * direction measured its -110% slot against the mask's 390px width instead of
 * the drawer's 280px, and the tap-to-close path asked whether the tapped row
 * was inside the mask (it never was).
 */

/**
 * The sidebar column. Structural selector with a hashed-class fragment, the
 * same one the stylesheet uses (layout.css.ts); the host ships no data marker
 * on the column itself.
 */
export const DRAWER_COLUMN_SELECTOR = '[class*="_sidebarCol"]'

/** Minimal structural slice of an element this module needs (node:test friendly). */
export interface DrawerHost {
  readonly firstElementChild: Element | null
  querySelector(selectors: string): Element | null
}

/**
 * Resolve the drawer inside the frame, with the first child as a fallback for
 * a host that ships no column marker (where the old behaviour is the only
 * option available).
 * @param frame - the shell frame (or a test double).
 * @returns the drawer element, or null when the frame is gone.
 */
export function pickDrawerColumn(frame: DrawerHost | null): Element | null {
  if (frame === null) return null
  const column = frame.querySelector(`:scope > ${DRAWER_COLUMN_SELECTOR}`)
  if (column !== null) return column
  return frame.firstElementChild
}
