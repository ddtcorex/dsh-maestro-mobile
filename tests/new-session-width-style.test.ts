import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the New Session button keeps its content-sized width', () => {
  // The drawer New Session control was force-fed width:100% by the
  // drawer-stretch block. Removing the declaration alone is NOT enough: its
  // parent is a flex COLUMN whose default cross-axis alignment stretches the
  // button back to the full column width (verified live: 284px both ways).
  // The button must opt out with align-self:flex-start — the same device
  // upstream uses for its collapsed rail state (.collapsed .newSession).
  assert.doesNotMatch(
    layout,
    /\[class\*="_newSession"\]\s*\{[^}]*width:\s*100%/,
  )
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] > :first-child \[class\*="_newSession"\]\s*\{\s*align-self:\s*flex-start;\s*\}/,
  )
})
