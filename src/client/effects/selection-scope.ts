import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installMobileEffect } from './phone-chrome.ts'

/**
 * Selection-handle drag scope: keep the session header out of hit-testing
 * while a conversation selection exists.
 *
 * A selection-handle drag over the session header resolves its hit-test in
 * the header chrome, so the selection extent lands on the first selectable
 * node after it instead of staying in message text (ported from upstream
 * v3.0.5 selection-autoscroll-ramp, pointer-events half only — deliberately
 * no layout change: any geometry shift mid-drag would disturb the selection
 * itself, and our drag-yield mark in drag-yield.ts covers a different axis,
 * drawer-swipe versus widget drags, so the two complement rather than
 * duplicate each other).
 *
 * Mechanism: a `selectionchange` listener raises `data-mobile-nav-selecting`
 * on `<html>` while a non-collapsed selection is anchored inside the
 * conversation (`[data-phase]`, excluding the composer card whose own chrome
 * must stay tappable); the stylesheet drops the header seat out of
 * hit-testing under that marker and the marker is removed the moment the
 * selection collapses, leaves the conversation, or the effect disarms — a
 * stuck marker would leave the header untappable.
 */

/** Marker the selecting CSS rule is scoped to (set on documentElement). */
export const SELECTING_ATTR = 'data-mobile-nav-selecting'

/** Minimal element face the scope check needs (injectable for tests). */
export interface ScopeCandidate {
  closest(selector: string): unknown
}

/**
 * Whether a value can answer `closest()`: real Elements, but also the
 * structural fakes the node:test suite passes.
 * @param value - the candidate (typically an event target or selection anchor).
 * @returns true when `closest` may be called on it.
 */
export function isScopeCandidate(value: unknown): value is ScopeCandidate {
  return typeof value === 'object' && value !== null && typeof (value as ScopeCandidate).closest === 'function'
}

/**
 * Whether a selection anchored at this element belongs to the conversation
 * flow whose header must exit hit-testing: inside `[data-phase]` but outside
 * the composer card (drawer fields and composer chrome keep their taps).
 * @param element - the selection anchor, resolved to an element or null.
 * @returns true when the selecting marker must be up for this anchor.
 */
export function selectionCountsForScope(element: unknown): boolean {
  if (!isScopeCandidate(element)) return false
  if (element.closest('[data-composer-card]') !== null) return false
  return element.closest('[data-phase]') !== null
}

/** Minimal selection face the marker decision reads (injectable for tests). */
export interface SelectionLike {
  isCollapsed: boolean
  anchorNode: unknown
}

/**
 * Resolve the element a selection is anchored at: an element anchors at
 * itself, a text node at its parent element, anything else anchors nowhere.
 * @param node - the selection's anchor node.
 * @returns the anchor element, or null when there is none.
 */
export function selectionAnchorElement(node: unknown): ScopeCandidate | null {
  if (isScopeCandidate(node)) return node
  if (typeof node === 'object' && node !== null) {
    const parent = (node as { parentElement?: unknown }).parentElement
    if (isScopeCandidate(parent)) return parent
  }
  return null
}

/**
 * Whether the selecting marker must be up for this selection state.
 * @param selection - the current selection, or null when there is none.
 * @returns true when the header must exit hit-testing.
 */
export function shouldMarkSelecting(selection: SelectionLike | null): boolean {
  if (selection === null || selection.isCollapsed) return false
  return selectionCountsForScope(selectionAnchorElement(selection.anchorNode))
}

/**
 * Raise `data-mobile-nav-selecting` on `<html>` while a conversation
 * selection exists, so the session header exits hit-testing for the drag.
 * @param ctx - client root context.
 */
export function installSelectionScope(ctx: ClientContext): void {
  installMobileEffect(ctx, 'dsh-maestro-mobile: selection scope', () => {
    const sync = (): void => {
      const selection = document.getSelection()
      const mark = shouldMarkSelecting(
        selection === null
          ? null
          : { isCollapsed: selection.isCollapsed, anchorNode: selection.anchorNode },
      )
      document.documentElement.toggleAttribute(SELECTING_ATTR, mark)
    }
    document.addEventListener('selectionchange', sync)
    return () => {
      document.removeEventListener('selectionchange', sync)
      document.documentElement.removeAttribute(SELECTING_ATTR)
    }
  })
}
