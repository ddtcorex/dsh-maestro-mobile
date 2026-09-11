import type { ReconcilerTask } from '../core/reconciler-core.ts'

// The upstream background-job control in the session header is a labelled
// trigger: it pins its full sentence at max-content width, which at 390px
// measured 179x28 inside the header and crushed the session title to 30px.
// The stylesheet collapses it to the same 28px circle as the drawer and
// right-sidebar toggles, with the count as a badge. Both the count and the
// "is a job live" dot the stylesheet keys on live behind hashed classes, so
// this task owns the stable markers instead.
//
// The jobs control is the only aria-expanded accordion in the session header's
// actions slot: the drawer toggle the plugin itself registers beside it is an
// icon button with no aria-expanded, so the marker cannot land on it.
const JOBS_TRIGGER =
  '[data-slot="conversation.session.header.actions"] button[class*="_trigger"][aria-expanded]'

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
      const trigger = document.querySelector(JOBS_TRIGGER)
      if (trigger === null) return
      trigger.setAttribute('data-mobile-nav', 'jobs')
      trigger.setAttribute(
        'data-jobs-count',
        String(jobsCountFromLabel(trigger.getAttribute('aria-label'))),
      )
    },
    dispose: () => { clear(document.querySelector('[data-mobile-nav="jobs"]')) },
  }
}
