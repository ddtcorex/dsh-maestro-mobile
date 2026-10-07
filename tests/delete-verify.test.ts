import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DELETE_VERIFY_ATTEMPTS,
  DELETE_VERIFY_INTERVAL_MS,
  verifySessionDeleted,
} from '../src/client/core/delete-verify.ts'

// The host moves the session to trash then aborts the reply, so the browser
// rejects the fetch for a delete that DID happen. The session list, not the
// fetch promise, is the judge: re-read it bounded and only report failure when
// the id survives every attempt.

test('an id already gone is accepted without waiting', async () => {
  let listed = true
  const sleeps: number[] = []
  const landed = await verifySessionDeleted({
    listed: () => listed,
    refresh: async () => { listed = false },
    sleep: async (ms) => { sleeps.push(ms) },
  })
  assert.equal(landed, true)
  assert.deepEqual(sleeps, [])
})

test('an id gone after retries is accepted', async () => {
  let looks = 0
  const sleeps: number[] = []
  const landed = await verifySessionDeleted({
    listed: () => { looks += 1; return looks < 3 },
    sleep: async (ms) => { sleeps.push(ms) },
  })
  assert.equal(landed, true)
  assert.equal(looks, 3)
  assert.equal(sleeps.length, 2)
})

test('an id surviving every attempt is reported as a failure', async () => {
  let reads = 0
  const sleeps: number[] = []
  const landed = await verifySessionDeleted({
    listed: () => true,
    refresh: async () => { reads += 1 },
    sleep: async (ms) => { sleeps.push(ms) },
  })
  assert.equal(landed, false)
  assert.equal(reads, DELETE_VERIFY_ATTEMPTS)
  assert.equal(sleeps.length, DELETE_VERIFY_ATTEMPTS - 1)
  assert.deepEqual([...new Set(sleeps)], [DELETE_VERIFY_INTERVAL_MS])
})

test('a throwing refresh never decides, the snapshot still does', async () => {
  let listed = true
  const landed = await verifySessionDeleted({
    listed: () => listed,
    refresh: async () => { throw new Error('refresh offline') },
    sleep: async () => { listed = false },
  })
  assert.equal(landed, true)
})

test('custom attempts and interval are honored', async () => {
  let reads = 0
  const sleeps: number[] = []
  const landed = await verifySessionDeleted({
    listed: () => true,
    refresh: async () => { reads += 1 },
    sleep: async (ms) => { sleeps.push(ms) },
    attempts: 2,
    intervalMs: 50,
  })
  assert.equal(landed, false)
  assert.equal(reads, 2)
  assert.deepEqual(sleeps, [50])
})

test('the verification budget is the documented default', () => {
  assert.equal(DELETE_VERIFY_ATTEMPTS, 4)
  assert.equal(DELETE_VERIFY_INTERVAL_MS, 350)
})
