import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the composer seat clears the iPhone home indicator without padding the AppFrame', () => {
  assert.match(
    layout,
    /\[data-phase="active"\] \[data-composer-seat\]\s*\{[^}]*padding-bottom:\s*max\(12px, env\(safe-area-inset-bottom, 0px\)\)\s*!important;/s,
  )
  assert.doesNotMatch(
    layout,
    /\[data-mobile-nav="frame"\]\s*\{[^}]*padding-bottom:\s*max\(12px, env\(safe-area-inset-bottom, 0px\)\)\s*!important;/s,
  )
})
