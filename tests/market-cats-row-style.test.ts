import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../src/client/styles/layout.css.ts', import.meta.url), 'utf8')

test('the drawer width cascade never reaches into modal dialog subtrees', () => {
  // The cascade must still stretch the sidebar content column inside the
  // drawer (regionArea / root / listArea / treeBody) ...
  assert.match(
    layout,
    /\[data-mobile-nav="frame"\] > :first-child :is\(\[class\*="_regionArea"\],\[class\*="_listArea"\],\[class\*="_treeBody"\],\[class\*="_root"\]\):not\(\[role="dialog"\] \*\):not\(\[aria-modal="true"\] \*\)\s*\{\s*width:\s*100%\s*!important;/s,
  )
  // ... but an UNGUARDED `_root` fragment rule is a collision bomb: every CSS
  // module whose local name is `root` compiles to a class containing `_root`
  // (`jR4zTa_root`, `eGUBIq_root`, primitives' `_root_19372_1`, ...), and the
  // settings sheet portals into the same drawer subtree. The unguarded rule
  // forced dshmarket's Menu anchor span to width:100% inside the flex
  // .catsRow, crushing .catsWrap (min-width:0) to zero width and stacking the
  // category chips under the overlapping Filter button.
  assert.doesNotMatch(
    layout,
    /\[class\*="_root"\]\)\s*\{\s*width:\s*100%/,
  )
})
