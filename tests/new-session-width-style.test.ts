import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the New Session button gets no width override at all', () => {
  // The drawer New Session control was force-fed width:100% by the
  // drawer-stretch block. Per user feedback (user-tested 2026-08-27) the fix
  // is exactly the removal of that declaration — no alignment overrides, no
  // replacement rule. The button renders under native upstream layout.
  assert.doesNotMatch(
    layout,
    /\[class\*="_newSession"\]\s*\{/,
  )
})
