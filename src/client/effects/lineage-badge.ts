import type { ReconcilerTask } from '../core/reconciler-core.ts'

// Compact badge for the subagent lineage trigger in the session header.
// Upstream renders "N subagent(s)" as a full sentence at max-content width
// (81px at 390px with one running subagent), which crushed the session
// title. Mirror the background-job control (jobs-indicator.ts): the trigger
// becomes a 28px circle keeping its chevron, with the count as a badge.
// Both the count and the trigger identity live behind hashed classes, so
// this task owns the stable markers instead (see layout.css.ts).
//
// The lineage trigger is the only accordion in the session header with
// aria-haspopup="tree": the session switcher beside it carries no popup
// attributes, and the plugin's own drawer toggle lives in the header
// actions slot, so the marker cannot land on either. Scoped to the header
// seat, not the crumbs nav: 0.1.7 moved the triggers out of the crumbs
// into the title cluster (no header button has a _crumbs ancestor there),
// and the old crumbs scope silently missed (measured live 2026-09-22).
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
 * Mark the session's lineage trigger with the compact-control marker and
 * its count. Registered on the shared reconciler, so the markers follow
 * the trigger as subagents start and settle, and `dispose` clears them
 * when the reconciler deactivates (the viewport left the mobile
 * breakpoint), keeping the wide layout untouched.
 * @returns the reconciler task owning the markers.
 */
export function createLineageBadgeTask(): ReconcilerTask {
  const clear = (trigger: Element | null): void => {
    if (trigger === null) return
    trigger.removeAttribute('data-mobile-nav')
    trigger.removeAttribute('data-lineage-count')
  }
  return {
    name: 'lineage-badge',
    scopes: ['*'],
    ensure: () => {
      const trigger = document.querySelector(LINEAGE_TRIGGER)
      if (trigger === null) return
      trigger.setAttribute('data-mobile-nav', 'lineage')
      trigger.setAttribute(
        'data-lineage-count',
        String(lineageCountFromLabel(trigger.getAttribute('aria-label'))),
      )
    },
    dispose: () => { clear(document.querySelector('[data-mobile-nav="lineage"]')) },
  }
}
