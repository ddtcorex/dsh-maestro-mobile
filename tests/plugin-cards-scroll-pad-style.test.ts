import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const compat = readFileSync(new URL('../src/client/styles/compat.css.ts', import.meta.url), 'utf8')

test('plugin-config card list gets scroll-bottom breathing room', () => {
  // The Plugins settings tab renders its cards in ul._cards whose native
  // padding is 0; scrolled to the bottom the last row sits flush against the
  // options-area edge and reads cut off. Give the list a 20px bottom pad,
  // anchored to the stable upstream slot marker (data-slot="settings.plugins
  // .tab") rather than a class hash, and scoped to the mobile frame.
  assert.match(
    compat,
    /\[data-mobile-nav="frame"\] \[aria-modal="true"\] \[data-slot="settings\.plugins\.tab"\] \[class\*="_cards"\]\s*\{\s*padding-bottom:\s*20px;\s*\}/,
  )
})
