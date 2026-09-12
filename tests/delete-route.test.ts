import assert from 'node:assert/strict'
import test from 'node:test'

import { isTrustedDeleteRequest, parseDeleteBody } from '../src/delete-route.ts'

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
