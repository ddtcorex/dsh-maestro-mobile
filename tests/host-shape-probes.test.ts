import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { hostCompressionEnabled } from '../src/compress.ts'
import { deleteCapabilities } from '../src/delete-session.ts'

/**
 * Two host-shape probes this plugin depends on, both read structurally so the
 * package imports no harness code.
 *
 * 1. Compression: on 0.2.2-alpha.2 the web server ships `compression@1.8.2` and
 *    the deployed profile enables it (`compression: gzip`). Measured live: the
 *    plugin's own brotli/gzip patch never wins — the middleware intercepts
 *    `writeHead` first — so installing a process-wide
 *    `http.ServerResponse.prototype` patch buys nothing when the host already
 *    compresses. The config field is `private` in the shipped .d.ts, so the
 *    probe is a private read that must fail OPEN (install the patch) when the
 *    shape is unreadable, because the host default is `compression: 'none'`.
 *
 * 2. Deletion: the delete flow unregisters live agents/sessions through
 *    `store`/`detach`/`detachEntered` and reads `persistence.config.root`. All
 *    exist on 0.2.2-alpha.2 but none is contractual, so the plugin asks once and
 *    warns instead of discovering it as a silently zombie session.
 */

test('host compression is detected from the web server config', () => {
  assert.equal(hostCompressionEnabled({ config: { compression: 'gzip' } }), true)
  assert.equal(hostCompressionEnabled({ config: { compression: 'br' } }), true)
})

test('an explicit "none" leaves the plugin patch responsible', () => {
  assert.equal(hostCompressionEnabled({ config: { compression: 'none' } }), false)
})

test('an unreadable host shape fails open (the plugin patch installs)', () => {
  assert.equal(hostCompressionEnabled(undefined), false)
  assert.equal(hostCompressionEnabled({}), false)
  assert.equal(hostCompressionEnabled({ config: {} }), false)
  assert.equal(hostCompressionEnabled({ config: { compression: 42 } }), false)
})

test('delete capabilities report the live-teardown faces', () => {
  const withFaces = deleteCapabilities({
    persistence: { config: { root: '/tmp/sessions' }, list: async () => [] },
    agents: { get: () => undefined, store: new Map(), detachEntered: () => {} },
    sessions: { get: () => undefined, flush: async () => true },
  })
  assert.deepEqual(withFaces, { storageRoot: true, liveTeardown: true })
})

test('a host without the private faces reports liveTeardown false', () => {
  const bare = deleteCapabilities({
    persistence: { config: { root: '/tmp/sessions' }, list: async () => [] },
    agents: { get: () => undefined },
    sessions: { get: () => undefined, flush: async () => true },
  })
  assert.deepEqual(bare, { storageRoot: true, liveTeardown: false })
})

test('a persistence backend without a public root reports storageRoot false', () => {
  const noRoot = deleteCapabilities({
    persistence: { list: async () => [] },
  })
  assert.equal(noRoot.storageRoot, false)
})
