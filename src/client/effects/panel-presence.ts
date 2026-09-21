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
 * Pure display decision for the drawer FAB, kept separate from the DOM probes
 * so the table is testable without a browser.
 * @param state - the shell's three live inputs.
 * @returns true when the floating drawer button should be rendered.
 */
export function shouldShowFab(state: {
  heroPhase: boolean
  drawerOpen: boolean
  panelOpen: boolean
}): boolean {
  if (state.panelOpen) return false
  return state.heroPhase && !state.drawerOpen
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
