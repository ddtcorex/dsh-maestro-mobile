import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stats = readFileSync(new URL('../src/client/effects/stats-line.ts', import.meta.url), 'utf8')

test('the stats-row hunter accepts the metric pills the row now renders', () => {
  // Upstream renders each metric as an interactive pill
  // (button[class*="_pill"], aria-label "2 turns 97 steps · 257 tok/s"), so
  // the old blanket `querySelector('button') !== null` bail-out stopped
  // matching the status row entirely and `[data-mobile-nav="stats"]` was never
  // set — the one-line scrolling strip in composer.css.ts was dead code.
  // Keep skipping interactive dock panels (the todo strip is still excluded by
  // its testid and the composer card by [data-composer-input]), but accept a
  // root whose buttons are all metric pills.
  assert.match(stats, /buttons\.every\(\(b\) => b\.matches\('\[class\*="_pill"\]'\)\)/)
  assert.doesNotMatch(stats, /if \(root\.querySelector\('button'\) !== null\) continue/)
})

test('the per-token fast path skips the full-tree hunt (v3.0.6 #194 lesson)', () => {
  // dsh-web-mobile v3.0.6 #194: the status task ran a full read/write cycle
  // every streaming frame with no skip-if-unchanged, janking scroll and
  // drawer on long sessions. This task wakes on every mutation
  // (scopes ['*']), so the fast path — anchor alive => fold TPS and return
  // before the document-wide `[data-phase] [class*="_root"]` scan — is the
  // whole performance story. Pin its order: the anchor aliveness check and
  // early return must precede the slow-path scan in mark().
  const markBody = stats.slice(stats.indexOf('const mark = '))
  const fastPath = markBody.indexOf('statsAnchorAlive(anchor)')
  const slowPath = markBody.indexOf('[data-phase] [class*="_root"]')
  assert.ok(fastPath !== -1, 'fast-path anchor check must exist in mark()')
  assert.ok(slowPath !== -1, 'slow-path full-tree scan must exist in mark()')
  assert.ok(fastPath < slowPath, 'fast path must precede the slow-path scan')
  // moveTps must early-return when the TPS readout is already folded into
  // the strip, so a rebuilt-nothing frame costs O(strip children), not
  // O(composer stack).
  assert.match(stats, /if \(\[\.\.\.stats\.children\]\.some\(\(c\) => \/\^TPS/)
})
