import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the drawer never force-feeds its rows a 100% width', () => {
  // The drawer used to reserve a right gutter on the session-tree root
  // (regionArea > root { padding-right: 0 }) and then stretch the rows. Both
  // halves are obsolete: the drawer now hugs its content with
  // `width: max-content; max-width: 92vw`, so the rows reach the content edge
  // on their own.
  //
  // The hazard that remains is the stretch itself: with the row's content-box
  // padding, `width: 100%` over-extends the rows past the drawer. The New
  // Session button stays content-sized too (user feedback 2026-08-27) —
  // asserted in new-session-width-style.test.ts.
  assert.doesNotMatch(
    layout,
    /:is\(\[class\*="_newSession"\],\[class\*="_sessionRow"\]\)\s*\{\s*width:\s*100%\s*!important;/s,
  )
})
