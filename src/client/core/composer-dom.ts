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

/** The visual viewport metrics, or null where the API is missing. */
export function viewportMetrics(): ViewportMetrics | null {
  const viewport = window.visualViewport
  if (viewport === null || viewport === undefined) return null
  return { height: viewport.height, scale: viewport.scale }
}
