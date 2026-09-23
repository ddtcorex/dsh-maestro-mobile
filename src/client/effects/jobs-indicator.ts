import type { ReconcilerTask } from '../core/reconciler-core.ts'

// The upstream background-job control in the session header is a labelled
// trigger: it pins its full sentence at max-content width, which at 390px
// measured 187x28 inside the header and crushed the session title. The
// stylesheet collapses it to the same 28px circle as the drawer and
// right-sidebar toggles, with the count as a badge. Both the count and the
// "is a job live" dot the stylesheet keys on live behind hashed classes, so
// this task owns the stable markers instead.
//
// The trigger carries no marker of its own upstream — its whole attribute set
// is type/class/aria-expanded/aria-label — so it is identified by the roles the
// other band residents declare plus its own contents:
//
//   - the subagent catalog declares aria-haspopup="tree";
//   - the Team action declares aria-haspopup="dialog";
//   - the schedule catalog leads with a clock icon, so its count badge is its
//     second child while the jobs control's badge (or its live state dot) is
//     its first.
//
// 0.1.7 moved the subagent catalog into this band at order -30, ahead of the
// jobs control at order 20, which is why reading the FIRST accordion matched
// the lineage trigger: the lineage chip took the jobs marker and its badge,
// while the jobs control kept upstream's full-width sentence (measured live
// 2026-09-24). The role exclusions keep a resident's own internals from
// deciding this, so a future upstream change to how a neighbouring control
// renders cannot hand it the marker.
export const JOBS_TRIGGER = [
  '[data-slot="conversation.session.header.actions"]',
  ' button[class*="_trigger"][aria-expanded]',
  ':not([aria-haspopup="tree"])',
  ':not([aria-haspopup="dialog"])',
  ':has(> :is([class*="_count"], [class*="_triggerDot"]):first-child)',
].join('')

/**
 * Read the job count out of the control's accessible name. Upstream localizes
 * the sentence around it ("N background jobs running", "N 个后台任务运行中") and
 * the compact control hides that text, so the leading integer is the only
 * locale-independent reading of the count.
 * @param label - the control's accessible name, absent when it carries none.
 * @returns the leading integer, or 0 when the label carries no number.
 */
export function jobsCountFromLabel(label: string | null | undefined): number {
  const match = /\d+/.exec(label ?? '')
  return match === null ? 0 : Number(match[0])
}

/**
 * Mark the session's background-job trigger with the compact-control marker
 * and its count. Registered on the shared reconciler, so the markers follow
 * both the trigger and the count as jobs start and settle, and `dispose`
 * clears them when the reconciler deactivates (the viewport left the mobile
 * breakpoint), keeping the wide layout untouched.
 * @returns the reconciler task owning the markers.
 */
export function createJobsIndicatorTask(): ReconcilerTask {
  const clear = (trigger: Element | null): void => {
    if (trigger === null) return
    trigger.removeAttribute('data-mobile-nav')
    trigger.removeAttribute('data-jobs-count')
  }
  return {
    name: 'jobs-indicator',
    scopes: ['*'],
    ensure: () => {
      // Exactly one candidate, or nothing: two would mean upstream added a
      // header action that also leads with a count badge, and no rule can tell
      // which is the jobs control. Yielding leaves the chip at upstream's width
      // — visible and recoverable — instead of compacting another feature's
      // control, which is the defect this selector exists to prevent.
      const candidates = document.querySelectorAll(JOBS_TRIGGER)
      if (candidates.length !== 1) return
      const trigger = candidates[0]
      if (trigger === undefined) return
      trigger.setAttribute('data-mobile-nav', 'jobs')
      trigger.setAttribute(
        'data-jobs-count',
        String(jobsCountFromLabel(trigger.getAttribute('aria-label'))),
      )
    },
    dispose: () => { clear(document.querySelector('[data-mobile-nav="jobs"]')) },
  }
}
