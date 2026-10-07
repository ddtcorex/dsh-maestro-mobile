// Bounded delete verification for the session-delete flow.
//
// Root cause: the host moves the session to trash then aborts the reply, so
// the browser fetch rejects with TypeError Failed to fetch for a delete that
// DID happen. The session LIST (not the fetch promise) is the judge: on a
// fetch THROW only, re-read the list a bounded number of times; id gone means
// the delete landed, id surviving every attempt means a real failure.
//
// DOM-free and pure: list access plus the wait are injected, so unit tests
// drive every timing path without a browser.

/** How many times an unanswered delete is re-checked against the list. */
export const DELETE_VERIFY_ATTEMPTS = 4

/** Delay in milliseconds between two re-checks of the session list. */
export const DELETE_VERIFY_INTERVAL_MS = 350

/**
 * What the post-throw delete verification needs, injected so it stays testable.
 */
export interface DeleteVerificationDeps {
  /** Whether the deleted id is still present in the current list snapshot. */
  listed: () => boolean
  /** Re-pull the list from the host, absent on hosts without refresh. */
  refresh?: (() => Promise<void>) | undefined
  /** Wait between attempts, the page passes a timer and tests a stub. */
  sleep: (ms: number) => Promise<void>
  /** Attempt budget, defaults to DELETE_VERIFY_ATTEMPTS. */
  attempts?: number
  /** Delay passed to sleep, defaults to DELETE_VERIFY_INTERVAL_MS. */
  intervalMs?: number
}

/**
 * Decide whether a session delete landed even though the fetch threw.
 *
 * Each attempt re-reads the list (refresh-then-check): a failed refresh is
 * not an answer and the snapshot below still decides. Returns true as soon
 * as the id is gone, false when the id survives the whole budget.
 * @param deps - list accessors plus the injected wait.
 * @returns true when the id is gone, false when it survives every attempt.
 */
export async function verifySessionDeleted(deps: DeleteVerificationDeps): Promise<boolean> {
  const attempts = deps.attempts ?? DELETE_VERIFY_ATTEMPTS
  const intervalMs = deps.intervalMs ?? DELETE_VERIFY_INTERVAL_MS
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await deps.refresh?.()
    } catch {
      // A failed refresh is not an answer, the snapshot below still is.
    }
    if (!deps.listed()) return true
    if (attempt + 1 < attempts) await deps.sleep(intervalMs)
  }
  return !deps.listed()
}
