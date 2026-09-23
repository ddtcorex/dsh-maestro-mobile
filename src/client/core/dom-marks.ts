// Marker writes for the DOM reconciler tasks.
//
// A reconciler task re-runs on every flush, and the shared observer watches
// attributes — so writing an attribute that already holds the wanted value queues
// another mutation, which schedules another flush, which writes again: a
// self-sustaining requestAnimationFrame loop with no input behind it (measured
// live on 0.1.7 at 390px: 240 marker writes per second, four per frame, from the
// jobs and lineage tasks alone — the only attributes churning in the whole
// document). Chrome queues a record even when the value is unchanged, so the
// write itself has to be conditional.

/** The two attribute operations a marker write needs. */
export interface MarkTarget {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

/**
 * Set one marker attribute only when it would change, so a steady state writes
 * nothing and the observer's flush chain can settle.
 * @param target - element carrying the marker.
 * @param name - attribute name.
 * @param value - attribute value to reach.
 */
export function setMarker(target: MarkTarget, name: string, value: string): void {
  if (target.getAttribute(name) === value) return
  target.setAttribute(name, value)
}
