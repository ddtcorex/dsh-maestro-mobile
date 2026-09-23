/**
 * Is a global sidebar panel ("Plugins", "Skills", …) currently occupying the
 * main column?
 *
 * This exists because "no active conversation phase" is NOT the same question
 * as "on the hero screen". A panel page replaces the conversation, so it also
 * carries no `[data-phase]` element — and the shell's FAB, which was mounted on
 * `heroPhase`, therefore floated over the panel's own content (38x38 at 10,72,
 * z-index 21, pointer-events auto): it covered the panel subtitle and swallowed
 * taps aimed at the panel.
 *
 * So the shell asks a POSITIVE question here rather than inferring a panel from
 * the absence of a conversation. Two independent host signals are accepted,
 * because not every panel is the plugin manager:
 *
 * - `[data-plugin-panel]` — the stable marker attribute the host sets on a
 *   panel page's own root (`PluginManagerPage.tsx`, `<section … data-plugin-panel>`);
 * - an active panel row — `[aria-current="page"]` on a sidebar panel entry
 *   (`SidebarRoot.tsx` PanelRow sets it when `activePanelId === id`), which
 *   covers a panel whose page carries no marker of its own.
 *
 * Either signal alone is sufficient; neither is required. A false positive only
 * hides a convenience button (the drawer stays reachable by edge swipe and by
 * the session header on a conversation), while a false negative puts the button
 * back on top of panel content.
 */

/** Selector for a host-rendered panel page root. */
const PANEL_PAGE_SELECTOR = '[data-plugin-panel]'

/**
 * Selector for the sidebar's currently selected global-panel row. Scoped to a
 * `nav` so an `aria-current="page"` somewhere else in the document (breadcrumb,
 * settings nav) cannot make the shell think a panel took over the main column.
 */
const ACTIVE_PANEL_ROW_SELECTOR = 'nav[aria-label] button[aria-current="page"]'

/**
 * What the shell FAB means right now.
 *
 * The button has two faces. While a sidebar panel owns the main column it reads
 * as "back to conversation" and leaves the panel; on the hero screen it opens
 * the drawer. It is the only control on screen in the panel case — the panel
 * replaces the conversation, so the session header (and with it the drawer
 * toggle) does not render, and the panel's own page head carries no way back
 * either. Hidden while the drawer is open, because the backdrop owns that state.
 *
 * `panelOpen` deliberately wins over `heroPhase`: a panel page carries no
 * `[data-phase="active"]`, so "no active phase" is ALSO true there (that
 * absence-based inference is what once put the FAB over the panel's subtitle
 * with no meaning at all). Now the same geometry carries a real action, and the
 * exit-panel face is anchored to the top-left corner in base.css.ts instead of
 * the hero seat.
 */
export type FabMode = 'hidden' | 'open-drawer' | 'exit-panel'

/** The shell's three live inputs for the FAB decision. */
export interface ShellFabState {
  heroPhase: boolean
  drawerOpen: boolean
  panelOpen: boolean
}

/**
 * Pure display decision for the shell FAB, kept separate from the DOM probes so
 * the table is testable without a browser.
 * @param state - the shell's three live inputs.
 * @returns which face to render (`hidden` renders nothing).
 */
export function fabMode(state: ShellFabState): FabMode {
  if (state.drawerOpen) return 'hidden'
  if (state.panelOpen) return 'exit-panel'
  return state.heroPhase ? 'open-drawer' : 'hidden'
}

/**
 * Read the live panel presence from the document.
 * @returns true when a global panel occupies the main column.
 */
export function isPanelOpen(): boolean {
  if (document.querySelector(PANEL_PAGE_SELECTOR) !== null) return true
  return document.querySelector(ACTIVE_PANEL_ROW_SELECTOR) !== null
}

/** The attribute/detail set the overlay's MutationObserver must watch to
 *  re-read panel presence without polling. `aria-current` changes when the
 *  selected panel row changes; childList covers a panel page mounting or
 *  unmounting. */
export const PANEL_MUTATION_ATTRIBUTE_FILTER = ['aria-current', 'data-sidebar-collapsed', 'data-phase'] as const
