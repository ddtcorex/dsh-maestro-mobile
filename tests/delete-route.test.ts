import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import test from 'node:test'

import {
  isTrustedDeleteRequest,
  MAX_DELETE_BODY_BYTES,
  parseDeleteBody,
  readDeleteBody,
} from '../src/delete-route.ts'

test('only POST is accepted', () => {
  assert.equal(isTrustedDeleteRequest({ method: 'POST' }), true)
  assert.equal(isTrustedDeleteRequest({ method: 'GET' }), false)
  assert.equal(isTrustedDeleteRequest({ method: 'DELETE' }), false)
  assert.equal(isTrustedDeleteRequest({}), false)
})

test('a cross-site request is refused even with a valid session', () => {
  // The deployment's PIN gate is a SameSite=Lax cookie, so a cross-site POST
  // cannot carry it — but Origin / Sec-Fetch-Site are checked as defence in
  // depth, because this endpoint destroys data.
  assert.equal(isTrustedDeleteRequest({ method: 'POST', secFetchSite: 'cross-site' }), false)
  assert.equal(isTrustedDeleteRequest({ method: 'POST', secFetchSite: 'same-origin' }), true)
  assert.equal(isTrustedDeleteRequest({ method: 'POST', secFetchSite: 'none' }), true)
})

test('an Origin from another host is refused, the same host is allowed', () => {
  assert.equal(
    isTrustedDeleteRequest({ method: 'POST', origin: 'https://evil.example', host: 'dsh.example' }),
    false,
  )
  assert.equal(
    isTrustedDeleteRequest({ method: 'POST', origin: 'https://dsh.example', host: 'dsh.example' }),
    true,
  )
  assert.equal(
    isTrustedDeleteRequest({ method: 'POST', origin: 'http://127.0.0.1:3082', host: '127.0.0.1:3082' }),
    true,
  )
  // Same host, different scheme/port than the Host header: still the same host.
  assert.equal(
    isTrustedDeleteRequest({ method: 'POST', origin: 'http://dsh.example', host: 'dsh.example:443' }),
    true,
  )
})

test('a missing Origin (curl, native shell) is allowed', () => {
  assert.equal(isTrustedDeleteRequest({ method: 'POST', host: '127.0.0.1:3082' }), true)
})

test('a malformed Origin is refused rather than treated as absent', () => {
  assert.equal(isTrustedDeleteRequest({ method: 'POST', origin: 'not a url', host: 'dsh.example' }), false)
})

test('the body parser accepts exactly one non-empty string sessionId', () => {
  assert.equal(parseDeleteBody('{"sessionId":"abc"}'), 'abc')
  assert.equal(parseDeleteBody('{"sessionId":""}'), null)
  assert.equal(parseDeleteBody('{"sessionId":123}'), null)
  assert.equal(parseDeleteBody('{"sessionId":null}'), null)
  assert.equal(parseDeleteBody('{}'), null)
  assert.equal(parseDeleteBody('not json'), null)
  assert.equal(parseDeleteBody(''), null)
  assert.equal(parseDeleteBody('[{"sessionId":"abc"}]'), null)
})

/** Drive readDeleteBody over a real Readable, tracking how it was consumed. */
async function read(chunks: readonly string[], limitBytes?: number) {
  const req = Readable.from(chunks)
  let ended = false
  req.on('end', () => { ended = true })
  const result = await readDeleteBody(req as unknown as IncomingMessage, limitBytes)
  return { result, ended }
}

test('a body within the limit is read whole', async () => {
  const { result, ended } = await read(['{"sessionId":', '"abc"}'])
  assert.deepEqual(result, { outcome: 'ok', body: '{"sessionId":"abc"}' })
  assert.equal(ended, true)
})

test('an oversized body is refused WITHOUT destroying the request', async () => {
  // Destroying the socket at the overflow point races the error response: the
  // reader rejects, the handler writes 413 into a dying socket, and the client
  // sees an empty reply instead of the reason. Drain instead — the request runs
  // to its natural end, so the response is still deliverable.
  const { result, ended } = await read(['{"sessionId":"', 'x'.repeat(MAX_DELETE_BODY_BYTES), '"}'])
  assert.equal(result.outcome, 'too-large')
  assert.equal(result.limitBytes, MAX_DELETE_BODY_BYTES)
  assert.equal(ended, true, 'the oversized request must be drained, not cut off')
})

test('exactly the limit is still accepted', async () => {
  const { result } = await read(['abcde'], 5)
  assert.deepEqual(result, { outcome: 'ok', body: 'abcde' })
})

test('the limit is measured in bytes, not code units', async () => {
  // A 3-byte character is one code unit: a code-unit cap would let a body of
  // multibyte characters through at three times the intended size.
  const { result } = await read(['€'.repeat(4)], 6)
  assert.equal(result.outcome, 'too-large')
})

test('a transport error is reported as an error, not as an oversized body', async () => {
  const req = new Readable({
    read() {
      this.destroy(new Error('socket hang up'))
    },
  })
  const result = await readDeleteBody(req as unknown as IncomingMessage)
  assert.equal(result.outcome, 'error')
  assert.match(result.message, /socket hang up/)
})
