import { setMarker } from '../core/dom-marks.ts'
import type { ReconcilerTask } from '../core/reconciler-core.ts'

// Compact badge for the subagent lineage trigger in the session header.
// Upstream renders "N subagent(s)" as a full sentence at max-content width
// (81px at 390px with one running subagent), which crushed the session
// title. Mirror the background-job control (jobs-indicator.ts): the trigger
// becomes a 28px circle keeping its chevron, with the count as a badge.
// Both the count and the trigger identity live behind hashed classes, so
// this task owns the stable markers instead (see layout.css.ts).
//
// The trigger's own box is marked too (data-lineage-root), because the touch
// shim scopes its synthetic-hover swallow to the chip + its portalled catalog:
// naming that scope with the CSS-module hashes of the day makes the swallow
// stop firing on the next build, silently (subagent-chip-touch.ts).
//
// The lineage trigger is the only accordion in the session header with
// aria-haspopup="tree" *and* a matching class: the switcher variant beside it
// in a subagent session carries no `_trigger` class at all (measured live on
// 0.1.7 at 390px: `IwR9Qa_switcherTrigger`, so the substring match misses it)
// and the session switcher in the crumbs carries no popup attributes, so the
// marker cannot land on another control. Scoped to the header seat, not the
// crumbs nav: 0.1.7 moved the triggers out of the crumbs into the title
// cluster (no header button has a _crumbs ancestor there), and the old crumbs
// scope silently missed (measured live 2026-09-22).
const LINEAGE_TRIGGER =
  '[data-mobile-nav="frame"] [data-slot="conversation.session.header"] button[class*="_trigger"][aria-haspopup="tree"]'

/**
 * Read the lineage count out of the trigger's accessible name. Upstream
 * localizes the sentence around it ("1 subagent", "N 个子代理") and the
 * compact control hides that text, so the leading integer is the only
 * locale-independent reading of the count.
 * @param label - the trigger's accessible name, absent when it carries none.
 * @returns the leading integer, or 0 when the label carries no number.
 */
export function lineageCountFromLabel(label: string | null | undefined): number {
  const match = /\d+/.exec(label ?? '')
  return match === null ? 0 : Number(match[0])
}

/**
 * Mark the session's lineage trigger with the compact-control marker and its
 * count, and the box around it with the scope marker the touch shim reads to
 * bound its synthetic-hover swallow (`data-lineage-root`). Registered on the
 * shared reconciler, so the markers follow the trigger as subagents start and
 * settle, and `dispose` clears them when the reconciler deactivates (the viewport
 * left the mobile breakpoint), keeping the wide layout untouched.
 * @returns the reconciler task owning the markers.
 */
export function createLineageBadgeTask(): ReconcilerTask {
  // The box the scope marker currently sits on. This task runs on every flush and
  // the observer watches attributes, so the marker moves only when the box really
  // changes (a React re-render can reparent the trigger): a clear-then-set pair
  // would queue a mutation on every frame and never let the loop settle.
  let scoped: Element | null = null
  const scopeTo = (root: Element | null): void => {
    if (scoped === root) return
    if (scoped !== null) scoped.removeAttribute('data-lineage-root')
    scoped = root
    if (root !== null) setMarker(root, 'data-lineage-root', '')
  }
  return {
    name: 'lineage-badge',
    scopes: ['*'],
    ensure: () => {
      const trigger = document.querySelector(LINEAGE_TRIGGER)
      if (trigger === null) return
      setMarker(trigger, 'data-mobile-nav', 'lineage')
      setMarker(
        trigger,
        'data-lineage-count',
        String(lineageCountFromLabel(trigger.getAttribute('aria-label'))),
      )
      scopeTo(trigger.parentElement)
    },
    dispose: () => {
      const trigger = document.querySelector('[data-mobile-nav="lineage"]')
      if (trigger !== null) {
        trigger.removeAttribute('data-mobile-nav')
        trigger.removeAttribute('data-lineage-count')
      }
      scopeTo(null)
    },
  }
}
