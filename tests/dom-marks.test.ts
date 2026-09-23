import assert from 'node:assert/strict'
import test from 'node:test'
import { setMarker, type MarkTarget } from '../src/client/core/dom-marks.ts'

/** Minimal stand-in for the two attribute operations a marker write needs. */
function target(initial: Record<string, string> = {}): MarkTarget & { writes: string[] } {
  const attributes = new Map(Object.entries(initial))
  return {
    writes: [],
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute(name, value) {
      this.writes.push(`${name}=${value}`)
      attributes.set(name, value)
    },
  }
}

test('a marker write reaches the value', () => {
  const element = target()
  setMarker(element, 'data-mobile-nav', 'jobs')
  assert.deepEqual(element.writes, ['data-mobile-nav=jobs'])
  assert.equal(element.getAttribute('data-mobile-nav'), 'jobs')
})

test('a marker already at its value is not written again', () => {
  // The reconciler re-runs every task on every flush and the shared observer
  // watches attributes, so re-writing an unchanged value queues a mutation that
  // schedules the next flush: the loop then runs at frame rate with nothing
  // driving it (measured live: 240 marker writes per second from the jobs and
  // lineage tasks). Chrome queues a record even when the value is unchanged, so
  // the write itself has to be conditional.
  const element = target({ 'data-jobs-count': '2' })
  setMarker(element, 'data-jobs-count', '2')
  assert.deepEqual(element.writes, [])
})

test('a marker whose value moved is rewritten', () => {
  const element = target({ 'data-jobs-count': '2' })
  setMarker(element, 'data-jobs-count', '3')
  assert.deepEqual(element.writes, ['data-jobs-count=3'])
})
