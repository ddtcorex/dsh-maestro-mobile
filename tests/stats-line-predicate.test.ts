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
