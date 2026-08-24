import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the floating toggle cluster is hidden while an aria-modal sheet is open', () => {
  assert.match(
    layout,
    /body:has\(\[aria-modal="true"\]\) \[data-dsh-toggle-cluster\]\s*\{\s*display:\s*none\s*!important;/s,
  )
})
