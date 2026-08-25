import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the session tree root drops its reserved right gutter so rows reach the drawer content edge', () => {
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] > :first-child \[class\*="_regionArea"\] \[class\*="_root"\]\s*\{\s*padding-right:\s*0\s*!important;/s,
  )
  // The widened drawer must NOT also force the rows to width:100%: that, with the
  // row's content-box padding, over-extends them past the drawer. The New
  // Session button stays content-sized too (user feedback 2026-08-27) —
  // asserted in new-session-width-style.test.ts.
  assert.doesNotMatch(
    layout,
    /:is\(\[class\*="_newSession"\],\[class\*="_sessionRow"\]\)\s*\{\s*width:\s*100%\s*!important;/s,
  )
})
