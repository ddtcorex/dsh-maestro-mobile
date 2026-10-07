import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the running status keeps clear of the sticky composer on phones', () => {
  // The sticky composer seat (bottom: 0, z-index 7) paints over the last
  // transcript pixels whenever the follow-tail scroll lands even a few px
  // short — e.g. the seat grows after the scroll (stats line, safe-area) or
  // the iOS viewport shifts. Measured on a phone: the "Deep diving for 7s"
  // line sat half under the composer card. Padding inside the running row
  // lifts its text above that danger zone; only the running row is touched,
  // so idle transcripts keep their exact spacing.
  assert.match(
    layout,
    /\[data-chat-running\]\s*\{[^}]*padding-bottom:\s*12px\s*!important;/s,
  )
})
