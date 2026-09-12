/**
 * Yield signals for draggable floating widgets.
 *
 * Plugins ship draggable widgets (desktop pet, floating ball, drag-to-reorder
 * handles) that live in the same left-edge zone the drawer swipe listens on.
 * Both layers would otherwise answer the same pointer stream, and dragging the
 * widget rightward opened the drawer mid-drag.
 *
 * Two mechanisms, deliberately different in nature:
 *
 * 1. The COOPERATION MARK — `data-mobile-nav-dragging` set by the dragging
 *    component while its drag is live, on the held element, an ancestor, or
 *    globally on `body` / `documentElement`. No guessing, but it needs the
 *    other component to opt in; the gesture layer reads it at pointerdown and
 *    again before the axis locks, because a dragger often raises the mark in
 *    its own pointerdown/move handler — after our stroke began.
 * 2. The POSITIONAL HEURISTIC — draggable widgets almost always live in a
 *    small freely-positioned layer (`position: fixed | absolute`, box at most
 *    {@link FLOATING_WIDGET_MAX_PX}px), so the first such ancestor of the
 *    event target counts as a widget and the stroke yields. This is an
 *    approximation with a known ceiling: a STATIC small positioned element
 *    (a badge, a dot) also yields, costing a stroke start under it, and a real
 *    widget that misses (bigger layer, static positioning) should upgrade to
 *    the cooperation mark.
 *
 * Our own frame subtree is excluded: the FAB, backdrop and drawer content
 * carry their own gesture semantics and must never be read as widgets.
 */

/** Cooperation mark a dragging component sets while its drag is live. */
export const DRAG_MARK = 'data-mobile-nav-dragging'

/** Upper bound (px) of the "small floating widget" positional heuristic. */
export const FLOATING_WIDGET_MAX_PX = 200

/** Minimal document face the mark check needs (injectable for tests). */
export interface DragMarkScope {
  documentElement: { hasAttribute(name: string): boolean }
  body: { hasAttribute(name: string): boolean } | null
}

/** Minimal element face the mark check needs. */
interface ClosestLike {
  closest(selector: string): unknown
}

const isClosestLike = (value: unknown): value is ClosestLike =>
  typeof value === 'object' && value !== null && typeof (value as ClosestLike).closest === 'function'

/**
 * Whether the cooperation mark is up for this stroke.
 * @param target - the stroke's event target (may be anything).
 * @param scope - the document scope to read global marks from, or null.
 * @returns true when the stroke must yield to a live drag.
 */
export function dragMarkYields(target: unknown, scope: DragMarkScope | null): boolean {
  if (scope === null) return false
  if (scope.documentElement.hasAttribute(DRAG_MARK)) return true
  if (scope.body !== null && scope.body.hasAttribute(DRAG_MARK)) return true
  if (!isClosestLike(target)) return false
  return target.closest(`[${DRAG_MARK}]`) !== null
}

/** Minimal element face the positional heuristic walks. */
interface WidgetCandidate {
  parentElement: Element | null
  offsetWidth: number
  offsetHeight: number
  closest(selector: string): Element | null
}

/** Computed-style reader the heuristic uses (injectable for tests). */
export type StyleReader = (element: Element) => { position: string }

const defaultStyleReader: StyleReader = (element) => getComputedStyle(element)

/**
 * Walk the ancestor chain for a small freely-positioned layer.
 * @param target - the stroke's event target.
 * @param styleOf - computed-style reader (defaults to `getComputedStyle`).
 * @param maxPx - size cap for "small" (defaults to {@link FLOATING_WIDGET_MAX_PX}).
 * @returns the widget layer, or null when the stroke owns itself.
 */
export function findFloatingWidget(
  target: unknown,
  styleOf: StyleReader = defaultStyleReader,
  maxPx: number = FLOATING_WIDGET_MAX_PX,
): Element | null {
  if (typeof target !== 'object' || target === null) return null
  const start = target as WidgetCandidate
  if (typeof start.closest !== 'function') return null
  if (start.closest('[data-mobile-nav="frame"]') !== null) return null
  let node: WidgetCandidate | null = start
  while (node !== null) {
    // Structural check only: keeps the walk DOM-free for unit tests and works
    // for SVG/foreign nodes that are not HTMLElement instances.
    if (typeof node.offsetWidth === 'number' && typeof node.offsetHeight === 'number') {
      const style = styleOf(node as unknown as Element)
      if (
        (style.position === 'fixed' || style.position === 'absolute') &&
        node.offsetWidth <= maxPx &&
        node.offsetHeight <= maxPx
      ) {
        return node as unknown as Element
      }
    }
    node = node.parentElement as WidgetCandidate | null
  }
  return null
}

/**
 * Whether a plugin-shipped floating widget owns the stroke positionally.
 * @param event - the pointer event whose target is being classified.
 * @param styleOf - computed-style reader (injectable for tests).
 * @returns true when the stroke must yield.
 */
export function floatingWidgetYields(
  event: { target: unknown },
  styleOf: StyleReader = defaultStyleReader,
): boolean {
  return findFloatingWidget(event.target, styleOf) !== null
}
