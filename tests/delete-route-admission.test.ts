import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { admitRequest } from '../src/delete-route.ts'

/**
 * The delete route destroys a session log, so it must sit behind the host's own
 * request authentication, not only behind its structural gate.
 *
 * DSH 0.2.2-alpha.2 serves the `/api` authentication fence from
 * `dsh-client-connection` as a PREFIX route, and the web server matches an exact
 * route before a prefix route, so a route registered on `webServer` alone is
 * outside it. Measured on the live host before this fix: `GET /api/file` without
 * a credential answered 401, while `POST /api/mobile-nav.session.delete` ran the
 * handler and answered 404 for an unknown id.
 *
 * The host publishes the call for exactly this case:
 * `connection.requestRejection(request)` answers 401/403 when it would refuse,
 * undefined when the request may proceed.
 */

const headers = { host: '127.0.0.1:3082' }

test('admits the request when the host connection raises no rejection', () => {
  const connection = { requestRejection: () => undefined }
  assert.deepEqual(admitRequest(connection, headers), { ok: true })
})

test('refuses with the host status when the connection rejects the credential', () => {
  assert.deepEqual(
    admitRequest({ requestRejection: () => 401 }, headers),
    { ok: false, status: 401, code: 'unauthorized' },
  )
  assert.deepEqual(
    admitRequest({ requestRejection: () => 403 }, headers),
    { ok: false, status: 403, code: 'forbidden' },
  )
})

test('fails closed when the host publishes no admission service', () => {
  // A destructive route must never fall through to "no authentication" just
  // because an older or partial host shape lacks the service.
  assert.deepEqual(admitRequest(undefined, headers), { ok: false, status: 503, code: 'admission-unavailable' })
  assert.deepEqual(admitRequest({}, headers), { ok: false, status: 503, code: 'admission-unavailable' })
})

test('fails closed when the admission check itself throws', () => {
  const connection = {
    requestRejection: () => {
      throw new Error('carrier exploded')
    },
  }
  assert.deepEqual(admitRequest(connection, headers), { ok: false, status: 503, code: 'admission-unavailable' })
})

test('passes the request headers through to the host check', () => {
  const seen: unknown[] = []
  const connection = {
    requestRejection: (request: { headers: unknown }) => {
      seen.push(request.headers)
      return undefined
    },
  }
  admitRequest(connection, headers)
  assert.deepEqual(seen, [headers])
})
